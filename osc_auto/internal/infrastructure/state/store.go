package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"omnisight/osc_auto/internal/domain"
)

const (
	maxStateBytes     = 4 << 20
	maxReplayItems    = 10_000
	maxPendingResults = 100
)

type persistedState struct {
	Sequence uint64             `json:"sequence"`
	Replay   map[string]int64   `json:"replay"`
	Results  []domain.JobResult `json:"results"`
}

type Store struct {
	mu    sync.Mutex
	path  string
	state persistedState
}

func Open(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("create state directory: %w", err)
	}
	if err := os.Chmod(dir, 0700); err != nil {
		return nil, fmt.Errorf("secure state directory: %w", err)
	}
	path := filepath.Join(dir, "agent-state.json")
	store := &Store{path: path, state: persistedState{Replay: make(map[string]int64)}}
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, fmt.Errorf("open agent state: %w", err)
	}
	defer file.Close()
	if err := file.Chmod(0600); err != nil {
		return nil, fmt.Errorf("secure agent state: %w", err)
	}
	info, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("stat agent state: %w", err)
	}
	if info.Size() > maxStateBytes {
		return nil, errors.New("agent state exceeds size limit")
	}
	decoder := json.NewDecoder(io.LimitReader(file, maxStateBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&store.state); err != nil {
		return nil, fmt.Errorf("agent state is corrupt: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, errors.New("agent state has trailing data")
	}
	if store.state.Replay == nil {
		store.state.Replay = make(map[string]int64)
	}
	if len(store.state.Replay) > maxReplayItems || len(store.state.Results) > maxPendingResults {
		return nil, errors.New("agent state limits exceeded")
	}
	return store, nil
}

func (s *Store) Next() (uint64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous := s.state.Sequence
	s.state.Sequence++
	if s.state.Sequence == 0 {
		s.state.Sequence = previous
		return 0, errors.New("heartbeat sequence exhausted")
	}
	if err := s.persistLocked(); err != nil {
		s.state.Sequence--
		return 0, err
	}
	return s.state.Sequence, nil
}

func (s *Store) Consume(nonce, jobID string, expiresAt, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, expiry := range s.state.Replay {
		if expiry <= now.Unix() {
			delete(s.state.Replay, key)
		}
	}
	nonceKey, jobKey := "nonce:"+nonce, "job:"+jobID
	if _, exists := s.state.Replay[nonceKey]; exists {
		return errors.New("job nonce already consumed")
	}
	if _, exists := s.state.Replay[jobKey]; exists {
		return errors.New("job id already consumed")
	}
	if len(s.state.Replay)+2 > maxReplayItems {
		return errors.New("replay store capacity reached")
	}
	expires := expiresAt.Unix()
	s.state.Replay[nonceKey], s.state.Replay[jobKey] = expires, expires
	if err := s.persistLocked(); err != nil {
		delete(s.state.Replay, nonceKey)
		delete(s.state.Replay, jobKey)
		return err
	}
	return nil
}

func (s *Store) Enqueue(result domain.JobResult) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.state.Results {
		if existing.JobID == result.JobID {
			return nil
		}
	}
	if len(s.state.Results) >= maxPendingResults {
		return errors.New("result outbox capacity reached")
	}
	s.state.Results = append(s.state.Results, result)
	if err := s.persistLocked(); err != nil {
		s.state.Results = s.state.Results[:len(s.state.Results)-1]
		return err
	}
	return nil
}

func (s *Store) Update(result domain.JobResult) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for index := range s.state.Results {
		if s.state.Results[index].JobID == result.JobID {
			previous := s.state.Results[index]
			s.state.Results[index] = result
			if err := s.persistLocked(); err != nil {
				s.state.Results[index] = previous
				return err
			}
			return nil
		}
	}
	return errors.New("job result is missing from outbox")
}

func (s *Store) Peek() (domain.JobResult, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.state.Results) == 0 {
		return domain.JobResult{}, false, nil
	}
	return s.state.Results[0], true, nil
}

func (s *Store) Remove(jobID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for index, result := range s.state.Results {
		if result.JobID == jobID {
			previous := append([]domain.JobResult(nil), s.state.Results...)
			s.state.Results = append(s.state.Results[:index], s.state.Results[index+1:]...)
			if err := s.persistLocked(); err != nil {
				s.state.Results = previous
				return err
			}
			return nil
		}
	}
	return nil
}

func (s *Store) IsEmpty() (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.state.Results) == 0, nil
}

func (s *Store) persistLocked() error {
	data, err := json.Marshal(s.state)
	if err != nil {
		return fmt.Errorf("encode agent state: %w", err)
	}
	if len(data) > maxStateBytes {
		return errors.New("agent state exceeds size limit")
	}
	tmp := s.path + ".tmp"
	_ = os.Remove(tmp)
	file, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return fmt.Errorf("create agent state temp file: %w", err)
	}
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("write agent state: %w", err)
	}
	if err := replaceFile(tmp, s.path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("replace agent state: %w", err)
	}
	return nil
}

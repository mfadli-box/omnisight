package mechanic

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

type WSMessage struct {
	Type    string `json:"type"`
	Payload string `json:"payload,omitempty"`
	Cols    int    `json:"cols,omitempty"`
	Rows    int    `json:"rows,omitempty"`
}

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  8192,
	WriteBufferSize: 8192,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func HandleSSHWebSocket(c *gin.Context, sshConfig *ssh.ClientConfig, host string, port int, sessionID, recordPath string) {
	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	recorder, err := newSessionRecorder(recordPath)
	if err != nil {
		writeWSJSON(conn, WSMessage{
			Type:    "error",
			Payload: "Failed to open session recording file",
		})
		return
	}
	defer recorder.Close()
	addr := fmt.Sprintf("%s:%d", host, port)
	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		writeWSJSON(conn, WSMessage{
			Type:    "error",
			Payload: "SSH connection failed: " + err.Error(),
		})
		return
	}
	defer client.Close()
	session, err := client.NewSession()
	if err != nil {
		writeWSJSON(conn, WSMessage{
			Type:    "error",
			Payload: "Failed to create SSH session",
		})
		return
	}
	defer session.Close()
	session.Stderr = nil
	stdin, err := session.StdinPipe()
	if err != nil {
		writeWSJSON(conn, WSMessage{
			Type:    "error",
			Payload: "Failed to open stdin pipe",
		})
		return
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		writeWSJSON(conn, WSMessage{
			Type:    "error",
			Payload: "Failed to open stdout pipe",
		})
		return
	}
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", 24, 80, modes); err != nil {
		writeWSJSON(conn, WSMessage{
			Type:    "error",
			Payload: "Failed to request PTY",
		})
		return
	}
	if err := session.Shell(); err != nil {
		writeWSJSON(conn, WSMessage{
			Type:    "error",
			Payload: "Failed to start shell",
		})
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				chunk := base64.StdEncoding.EncodeToString(buf[:n])
				recorder.Append(sessionID, "out", chunk)
				if err := writeWSJSON(conn, WSMessage{
					Type:    "output",
					Payload: chunk,
				}); err != nil {
					cancel()
					return
				}
			}
			if err != nil {
				cancel()
				return
			}
		}
	}()
	go func() {
		for {
			_, payload, err := conn.ReadMessage()
			if err != nil {
				cancel()
				return
			}
			var msg WSMessage
			if err := json.Unmarshal(payload, &msg); err != nil {
				continue
			}
			switch msg.Type {
			case "data":
				raw, derr := base64.StdEncoding.DecodeString(msg.Payload)
				if derr != nil {
					continue
				}
				recorder.Append(sessionID, "in", msg.Payload)
				if _, werr := stdin.Write(raw); werr != nil {
					cancel()
					return
				}
			case "resize":
				if msg.Cols > 0 && msg.Rows > 0 {
					_ = session.WindowChange(msg.Rows, msg.Cols)
				}
			case "close":
				cancel()
				return
			}
		}
	}()
	<-ctx.Done()
	_ = session.Close()
	writeWSJSON(conn, WSMessage{Type: "close", Payload: "Connection closed"})
}

func writeWSJSON(conn *websocket.Conn, msg WSMessage) error {
	payload, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, payload)
}

type sessionRecorder struct {
	file *os.File
}

func newSessionRecorder(path string) (*sessionRecorder, error) {
	if path == "" {
		return &sessionRecorder{file: nil}, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o640)
	if err != nil {
		return nil, err
	}
	return &sessionRecorder{file: f}, nil
}

func (r *sessionRecorder) Append(sessionID, dir, data string) {
	if r.file == nil {
		return
	}
	line, err := json.Marshal(map[string]any{
		"t":   time.Now().UnixMilli(),
		"id":  sessionID,
		"dir": dir,
		"d":   data,
	})
	if err != nil {
		return
	}
	_, _ = r.file.Write(append(line, '\n'))
}

func (r *sessionRecorder) Close() {
	if r.file != nil {
		_ = r.file.Close()
	}
}

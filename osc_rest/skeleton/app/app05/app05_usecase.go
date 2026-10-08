package app

import (
	"context"
	"errors"
	"strings"

	"osc_rest/mechanic"

	"github.com/jackc/pgx/v5/pgxpool"
)

var pg *pgxpool.Pool

func Use(db *pgxpool.Pool) {
	pg = db
}

// --- User Session ---

func ListSessions(ctx context.Context, p mechanic.GridParams) (mechanic.Page[SessionResponse], error) {
	return sessionList(ctx, pg, p)
}

func GetSession(ctx context.Context, id string) (SessionResponse, error) {
	return sessionGet(ctx, pg, id)
}

func CreateSession(ctx context.Context, in SessionCreate) (SessionResponse, error) {
	in.UserID = strings.TrimSpace(in.UserID)
	in.SessionToken = strings.TrimSpace(in.SessionToken)
	if in.UserID == "" {
		return SessionResponse{}, errors.New("user_id is required")
	}
	if in.SessionToken == "" {
		return SessionResponse{}, errors.New("session_token is required")
	}
	if in.Status == "" {
		in.Status = "ACTIVE"
	}
	if !SessionStatuses[in.Status] {
		return SessionResponse{}, errors.New("invalid status")
	}
	return sessionCreate(ctx, pg, in)
}

func UpdateSession(ctx context.Context, id string, in SessionUpdate) (SessionResponse, error) {
	if in.Status != nil && !SessionStatuses[*in.Status] {
		return SessionResponse{}, errors.New("invalid status")
	}
	return sessionUpdate(ctx, pg, id, in)
}

func DeleteSession(ctx context.Context, id string) error {
	return sessionDelete(ctx, pg, id)
}

// --- User Token ---

func ListTokens(ctx context.Context, p mechanic.GridParams) (mechanic.Page[TokenResponse], error) {
	return tokenList(ctx, pg, p)
}

func GetToken(ctx context.Context, id string) (TokenResponse, error) {
	return tokenGet(ctx, pg, id)
}

func CreateToken(ctx context.Context, in TokenCreate) (TokenResponse, error) {
	in.UserID = strings.TrimSpace(in.UserID)
	in.Token = strings.TrimSpace(in.Token)
	if in.UserID == "" {
		return TokenResponse{}, errors.New("user_id is required")
	}
	if in.Token == "" {
		return TokenResponse{}, errors.New("token is required")
	}
	if in.TokenType == "" {
		in.TokenType = "JWT"
	}
	if !TokenTypes[in.TokenType] {
		return TokenResponse{}, errors.New("invalid token_type")
	}
	if strings.TrimSpace(in.AccessExpiresAt) == "" {
		return TokenResponse{}, errors.New("access_expires_at is required")
	}
	return tokenCreate(ctx, pg, in)
}

func UpdateToken(ctx context.Context, id string, in TokenUpdate) (TokenResponse, error) {
	if in.TokenType != nil && !TokenTypes[*in.TokenType] {
		return TokenResponse{}, errors.New("invalid token_type")
	}
	return tokenUpdate(ctx, pg, id, in)
}

func DeleteToken(ctx context.Context, id string) error {
	return tokenDelete(ctx, pg, id)
}

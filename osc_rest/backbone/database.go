package backbone

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

var PgSQL *pgxpool.Pool

func SetDatabase() {
	godotenv.Load()
	PG_Host := os.Getenv("PG_HOST")
	PG_Port := os.Getenv("PG_PORT")
	PG_User := os.Getenv("PG_USER")
	PG_Pass := os.Getenv("PG_PASS")
	PG_Data := os.Getenv("PG_DATA")
	IS_Pool := os.Getenv("IS_POOL")
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		PG_Host, PG_Port, PG_User, PG_Pass, PG_Data)
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		log.Fatalf("Failed to parse database config: %v", err)
	}
	if IS_Pool == "true" {
		cfg.MaxConns = 100
		cfg.MinConns = 10
	} else {
		cfg.MaxConns = 50
		cfg.MinConns = 25
	}
	PgSQL, err = pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	if err = PgSQL.Ping(context.Background()); err != nil {
		log.Fatalf("Database did not respond: %v", err)
	}
}

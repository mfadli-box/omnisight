#!/usr/bin/env bash
# ==============================================================================
# OmniSight (OSC) — Launcher Script for Codex CLI Agent Sessions
# Location: ./omnisight.sh
# ==============================================================================

ROLE="${1:-rest}"

case "$ROLE" in
  rest)
    AGENT_ROLE="ai-rest (Backend Rust Engineer)"
    MODEL="gpt-6.2-astra"
    REASONING="high"
    ;;
  site)
    AGENT_ROLE="ai-site (Frontend Next.js Developer)"
    MODEL="gpt-6.2-astra"
    REASONING="high"
    ;;
  auto)
    AGENT_ROLE="ai-auto (Golang SRE Agent Developer)"
    MODEL="gpt-6-sol"
    REASONING="medium"
    ;;
  base)
    AGENT_ROLE="ai-base (PostgreSQL DB Specialist)"
    MODEL="gpt-6.1-terra"
    REASONING="medium"
    ;;
  docs)
    AGENT_ROLE="ai-docs (QA & Security Tester)"
    MODEL="gpt-6.1-terra"
    REASONING="high"
    ;;
  main)
    AGENT_ROLE="ai-main (Project Orchestrator)"
    MODEL="gpt-6.2-sol"
    REASONING="high"
    ;;
  *)
    echo "Penggunaan: ./omnisight.sh [rest|site|auto|base|docs|main]"
    exit 1
    ;;
esac

echo "======================================================================"
echo " Launching OmniSight Agent Session: $AGENT_ROLE"
echo " Model: $MODEL | Reasoning Effort: $REASONING"
echo "======================================================================"

SYSTEM_CONTEXT=""
if [ -f "AGENTS.md" ]; then
    SYSTEM_CONTEXT=$(cat AGENTS.md)
fi

# Panggilan Codex CLI menggunakan flag '--no-daemon' untuk menghindari masalah background socket:
codex --no-daemon --model "$MODEL" -- "Sistem Guardrails:
$SYSTEM_CONTEXT

Role Aktif: $AGENT_ROLE. Silakan masukkan Micro Prompt (contoh: MP-20261124-CM02-01)."

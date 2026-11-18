# AskMyDocs MCP server — stdio transport, for Claude Desktop / Claude Code.
#
# Built from the backend/ context (docker build -f mcp_server/Dockerfile ./backend)
# so it can import core/, models/, services/ and utils/ without duplicating them.
# Run with `docker run -i` (no -t): stdio carries the MCP JSON-RPC protocol, and a
# pseudo-tty would inject escape sequences that corrupt it.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Requirements.txt .
RUN pip install --upgrade pip && pip install -r Requirements.txt

COPY . .

ENTRYPOINT ["python", "-m", "mcp_server.server"]

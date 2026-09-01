#!/usr/bin/env bash
#
# clean-oracle-db.sh
#
# Deletes all application data from the Oracle integration DB.
# Does NOT load mock data and does NOT touch Prisma migrations.
#
# Requirements:
#   - Docker container up (docker compose up -d)
#   - sqlcmd available inside the container
#

set -euo pipefail

# ============================================================
# Load .env
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

source "$ENV_FILE"

# ============================================================
# Validate required variables
# ============================================================

: "${DB_NAME:?DB_NAME is not set}"
: "${DB_USER:?DB_USER is not set}"
: "${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD is not set}"

# ============================================================
# Configuration
# ============================================================

SQLCMD_BIN="/opt/mssql-tools18/bin/sqlcmd"
CONTAINER="oracle_fusion_integration_db"
TMP_FILE="/tmp/db_cleanup.sql"

# ============================================================
# Cleanup SQL
# ============================================================

cat > /tmp/db_cleanup_body.sql <<'EOF'
-- ============================================================
-- Clean child tables first
-- ============================================================

DELETE FROM [dbo].[oracle_wo_operation_materials];

DELETE FROM [dbo].[oracle_wo_operation_human_resources];

DELETE FROM [dbo].[oracle_wo_operations];

-- ============================================================
-- Clean parent tables
-- ============================================================

DELETE FROM [dbo].[oracle_work_orders];

EOF

# ============================================================
# Execute cleanup
# ============================================================

echo "============================================================"
echo ">>> [$CONTAINER] cleaning database [$DB_NAME]..."

docker cp /tmp/db_cleanup_body.sql "$CONTAINER:$TMP_FILE"

docker exec "$CONTAINER" "$SQLCMD_BIN" \
  -S localhost \
  -U "$DB_USER" \
  -P "$MSSQL_SA_PASSWORD" \
  -d "$DB_NAME" \
  -C \
  -b \
  -i "$TMP_FILE"

# ============================================================
# Cleanup temporary files
# ============================================================

docker exec "$CONTAINER" rm -f "$TMP_FILE" 2>/dev/null || true
rm -f /tmp/db_cleanup_body.sql

echo ">>> [$CONTAINER] cleaned successfully."
echo "============================================================"
echo "Oracle database cleaned successfully."
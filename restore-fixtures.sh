#!/bin/bash
set -e

###############################################################################
# FIXTURE DATASET RESTORATION SCRIPT
# Restores two verified fixture datasets to feature/bsd-stage-a-provider branch
# ABSOLUTE SAFETY: Never touches main, never force-pushes, never modifies code
###############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

die() {
    log_error "$1"
    exit 1
}

###############################################################################
# STEP 1: VERIFY GIT ENVIRONMENT
###############################################################################
log_info "STEP 1: Verifying Git environment..."

if ! git rev-parse --show-toplevel &>/dev/null; then
    die "Not a real Git repository. Aborting."
fi

TOPLEVEL=$(git rev-parse --show-toplevel)
log_success "Git repository root: $TOPLEVEL"

CURRENT_BRANCH=$(git branch --show-current)
log_success "Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "feature/bsd-stage-a-provider" ]; then
    die "Current branch is '$CURRENT_BRANCH', not 'feature/bsd-stage-a-provider'. Aborting."
fi

FEATURE_HEAD=$(git rev-parse HEAD)
log_success "Feature branch HEAD: $FEATURE_HEAD"

log_info "Git status:"
git status --short --branch

###############################################################################
# STEP 2: VERIFY MAIN BEFORE DOING ANYTHING
###############################################################################
log_info "STEP 2: Recording main branch SHA..."

MAIN_SHA_BEFORE=$(git rev-parse main)
log_success "Main SHA (before): $MAIN_SHA_BEFORE"

###############################################################################
# STEP 3: LOCATE THE VERIFIED ZIP
###############################################################################
log_info "STEP 3: Locating verified project ZIP..."

# Check for ZIP file in common locations
ZIP_FILE=""
for candidate in "verified-fixtures.zip" "verified.zip" "fixtures-verified.zip"; do
    if [ -f "$candidate" ]; then
        ZIP_FILE="$candidate"
        break
    fi
done

if [ -z "$ZIP_FILE" ]; then
    die "Could not find verified project ZIP. Expected files: verified-fixtures.zip, verified.zip, or fixtures-verified.zip"
fi

log_success "Found verified ZIP: $ZIP_FILE"

# Verify ZIP contains the required files
if ! unzip -t "$ZIP_FILE" "src/data/upcoming_fixtures.json" &>/dev/null; then
    die "ZIP does not contain src/data/upcoming_fixtures.json"
fi

if ! unzip -t "$ZIP_FILE" "data/fixtures-manifest-enriched.json" &>/dev/null; then
    die "ZIP does not contain data/fixtures-manifest-enriched.json"
fi

log_success "ZIP contains both required files"

###############################################################################
# STEP 4: VERIFY ZIP CONTENTS - CALCULATE GIT BLOB SHAS
###############################################################################
log_info "STEP 4: Verifying Git blob SHAs..."

# Extract files to temp location
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

unzip -q "$ZIP_FILE" "src/data/upcoming_fixtures.json" -d "$TEMP_DIR"
unzip -q "$ZIP_FILE" "data/fixtures-manifest-enriched.json" -d "$TEMP_DIR"

# Function to calculate Git blob SHA
calculate_blob_sha() {
    local file=$1
    (echo -n "blob $(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)"; echo -ne '\0'; cat "$file") | sha1sum | awk '{print $1}'
}

# Verify first file
FILE1_PATH="$TEMP_DIR/src/data/upcoming_fixtures.json"
FILE1_SHA=$(calculate_blob_sha "$FILE1_PATH")
EXPECTED_SHA1="3f36d65bfa0355f4fe0a941b155b635c84a442e0"

log_info "src/data/upcoming_fixtures.json SHA: $FILE1_SHA"
log_info "Expected SHA: $EXPECTED_SHA1"

if [ "$FILE1_SHA" != "$EXPECTED_SHA1" ]; then
    die "SHA mismatch for src/data/upcoming_fixtures.json. Do NOT repair or regenerate."
fi
log_success "src/data/upcoming_fixtures.json SHA verified"

# Verify second file
FILE2_PATH="$TEMP_DIR/data/fixtures-manifest-enriched.json"
FILE2_SHA=$(calculate_blob_sha "$FILE2_PATH")
EXPECTED_SHA2="dafa388ea8e90dd19f44d957209cc27b3a4a443c"

log_info "data/fixtures-manifest-enriched.json SHA: $FILE2_SHA"
log_info "Expected SHA: $EXPECTED_SHA2"

if [ "$FILE2_SHA" != "$EXPECTED_SHA2" ]; then
    die "SHA mismatch for data/fixtures-manifest-enriched.json. Do NOT repair or regenerate."
fi
log_success "data/fixtures-manifest-enriched.json SHA verified"

###############################################################################
# STEP 5: VERIFY CONTENT COUNTS
###############################################################################
log_info "STEP 5: Verifying content counts..."

# Verify file 1
FILE1_RECORDS=$(jq 'length' "$FILE1_PATH")
FILE1_IDS=$(jq -r '.[].id' "$FILE1_PATH" | wc -l)
FILE1_UNIQUE_IDS=$(jq -r '.[].id' "$FILE1_PATH" | sort -u | wc -l)
FILE1_DUPES=$((FILE1_IDS - FILE1_UNIQUE_IDS))

log_info "src/data/upcoming_fixtures.json: $FILE1_RECORDS records, $FILE1_UNIQUE_IDS unique IDs, $FILE1_DUPES duplicates"

if [ "$FILE1_RECORDS" != "1318" ]; then
    die "File 1 record count is $FILE1_RECORDS, expected 1318"
fi
if [ "$FILE1_UNIQUE_IDS" != "1318" ]; then
    die "File 1 unique ID count is $FILE1_UNIQUE_IDS, expected 1318"
fi
if [ "$FILE1_DUPES" != "0" ]; then
    die "File 1 has $FILE1_DUPES duplicates, expected 0"
fi
log_success "src/data/upcoming_fixtures.json counts verified"

# Verify file 2
FILE2_RECORDS=$(jq 'length' "$FILE2_PATH")
FILE2_IDS=$(jq -r '.[].id' "$FILE2_PATH" | wc -l)
FILE2_UNIQUE_IDS=$(jq -r '.[].id' "$FILE2_PATH" | sort -u | wc -l)
FILE2_DUPES=$((FILE2_IDS - FILE2_UNIQUE_IDS))

log_info "data/fixtures-manifest-enriched.json: $FILE2_RECORDS records, $FILE2_UNIQUE_IDS unique IDs, $FILE2_DUPES duplicates"

if [ "$FILE2_RECORDS" != "1463" ]; then
    die "File 2 record count is $FILE2_RECORDS, expected 1463"
fi
if [ "$FILE2_UNIQUE_IDS" != "1463" ]; then
    die "File 2 unique ID count is $FILE2_UNIQUE_IDS, expected 1463"
fi
if [ "$FILE2_DUPES" != "0" ]; then
    die "File 2 has $FILE2_DUPES duplicates, expected 0"
fi
log_success "data/fixtures-manifest-enriched.json counts verified"

###############################################################################
# STEP 6: RESTORE THE FILES
###############################################################################
log_info "STEP 6: Restoring files from verified ZIP..."

cp "$FILE1_PATH" "src/data/upcoming_fixtures.json"
log_success "Restored src/data/upcoming_fixtures.json"

cp "$FILE2_PATH" "data/fixtures-manifest-enriched.json"
log_success "Restored data/fixtures-manifest-enriched.json"

###############################################################################
# STEP 7: VERIFY GIT STATUS
###############################################################################
log_info "STEP 7: Verifying modified files..."

git status --short

MODIFIED=$(git status --short | awk '{print $2}' | sort)
EXPECTED_FILES=$'data/fixtures-manifest-enriched.json\nsrc/data/upcoming_fixtures.json'
EXPECTED_SORTED=$(echo "$EXPECTED_FILES" | sort)

if [ "$MODIFIED" != "$EXPECTED_SORTED" ]; then
    log_error "Unexpected modified files detected. Reverting..."
    git checkout -- .
    die "Only src/data/upcoming_fixtures.json and data/fixtures-manifest-enriched.json should be modified."
fi
log_success "Only the two required files are modified"

###############################################################################
# STEP 8: STAGE ONLY THE TWO FILES
###############################################################################
log_info "STEP 8: Staging files..."

git add -- src/data/upcoming_fixtures.json data/fixtures-manifest-enriched.json
log_success "Files staged"

log_info "Cached files:"
git diff --cached --name-only

CACHED=$(git diff --cached --name-only | sort)
if [ "$CACHED" != "$EXPECTED_SORTED" ]; then
    die "Staged files don't match expected. Aborting."
fi
log_success "Exactly the two required files are staged"

###############################################################################
# STEP 9: COMMIT
###############################################################################
log_info "STEP 9: Creating commit..."

git commit -m "chore: restore verified fixture datasets"

NEW_HEAD=$(git rev-parse HEAD)
log_success "Commit created: $NEW_HEAD"

###############################################################################
# STEP 10: VERIFY THE COMMIT
###############################################################################
log_info "STEP 10: Verifying commit..."

log_info "Commit details:"
git show --stat --oneline HEAD

log_info "Files changed in this commit:"
git diff --name-only HEAD^

COMMIT_FILES=$(git diff --name-only HEAD^ | sort)
if [ "$COMMIT_FILES" != "$EXPECTED_SORTED" ]; then
    die "Commit contains unexpected files. Aborting push."
fi
log_success "Commit contains exactly the two required files"

###############################################################################
# STEP 11: VERIFY MAIN WAS NOT TOUCHED
###############################################################################
log_info "STEP 11: Verifying main branch is unchanged..."

MAIN_SHA_AFTER=$(git rev-parse main)

if [ "$MAIN_SHA_BEFORE" != "$MAIN_SHA_AFTER" ]; then
    die "Main branch SHA changed! Before: $MAIN_SHA_BEFORE, After: $MAIN_SHA_AFTER"
fi
log_success "Main branch is unchanged"

###############################################################################
# STEP 12: PUSH SAFELY
###############################################################################
log_info "STEP 12: Pushing to remote..."

CURRENT_BRANCH_CHECK=$(git branch --show-current)
CURRENT_HEAD_CHECK=$(git rev-parse HEAD)

if [ "$CURRENT_BRANCH_CHECK" != "feature/bsd-stage-a-provider" ]; then
    die "Branch changed during process! Current: $CURRENT_BRANCH_CHECK"
fi

if [ "$CURRENT_HEAD_CHECK" != "$NEW_HEAD" ]; then
    die "HEAD changed during process!"
fi

log_info "Pushing feature/bsd-stage-a-provider to origin..."
git push origin feature/bsd-stage-a-provider

log_success "Push completed"

###############################################################################
# FINAL REPORT
###############################################################################
echo ""
echo "=========================================="
echo "RESTORATION COMPLETED SUCCESSFULLY"
echo "=========================================="
echo ""
echo "1. Initial feature branch HEAD:     $FEATURE_HEAD"
echo "2. Final feature branch HEAD:       $NEW_HEAD"
echo "3. Main SHA before:                 $MAIN_SHA_BEFORE"
echo "4. Main SHA after:                  $MAIN_SHA_AFTER"
echo "5. Commit SHA:                      $NEW_HEAD"
echo "6. Commit message:                  chore: restore verified fixture datasets"
echo "7. Files committed:                 src/data/upcoming_fixtures.json"
echo "                                    data/fixtures-manifest-enriched.json"
echo "8. Blob SHA (upcoming_fixtures):    $FILE1_SHA"
echo "9. Blob SHA (fixtures-manifest):    $FILE2_SHA"
echo "10. Records (upcoming_fixtures):    $FILE1_RECORDS"
echo "11. Records (fixtures-manifest):    $FILE2_RECORDS"
echo "12. Unique IDs (upcoming_fixtures): $FILE1_UNIQUE_IDS"
echo "13. Unique IDs (fixtures-manifest): $FILE2_UNIQUE_IDS"
echo "14. Duplicates (upcoming_fixtures): $FILE1_DUPES"
echo "15. Duplicates (fixtures-manifest): $FILE2_DUPES"
echo "16. Push succeeded:                 YES"
echo "17. Main untouched:                 YES"
echo "18. Only required files committed:  YES"
echo ""
log_success "All safety checks passed"

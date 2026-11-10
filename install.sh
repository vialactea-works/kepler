#!/usr/bin/env bash
set -euo pipefail

KEPLER_REPO_SLUG="${KEPLER_REPO_SLUG:-vialactea-works/kepler}"
MAX_COMPRESSED_BYTES=536870912
MAX_EXPANDED_BYTES=1073741824
MAX_ARCHIVE_FILES=20000
MAX_ARCHIVE_PATH_BYTES=100
MAX_IDENTITY_OUTPUT_BYTES=1024
INSTALL_WORK_DIR=""
INSTALL_WORK_IDENTITY=""
INSTALL_COMPLETE=0

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

directory_identity() {
  local path="$1"
  case "$(uname -s)" in
    Darwin) stat -f '%d:%i' "$path" ;;
    Linux) stat -c '%d:%i' "$path" ;;
    *) return 1 ;;
  esac
}

install_work_dir_is_owned() {
  local current_identity
  [[ -n "$INSTALL_WORK_IDENTITY" && -d "$INSTALL_WORK_DIR" && ! -L "$INSTALL_WORK_DIR" ]] || return 1
  current_identity="$(directory_identity "$INSTALL_WORK_DIR")" || return 1
  [[ "$current_identity" == "$INSTALL_WORK_IDENTITY" ]]
}

cleanup_install_work_dir() {
  local status=$?
  trap - EXIT
  if [[ -z "$INSTALL_WORK_DIR" ]]; then
    exit "$status"
  fi
  if ! install_work_dir_is_owned; then
    printf 'error: bootstrap will not clean staging path after its directory identity changed; inspect %s and the displaced original evidence\n' "$INSTALL_WORK_DIR" >&2
    if [[ "$status" == "0" ]]; then
      exit 1
    fi
    exit "$status"
  fi
  if [[ "$INSTALL_COMPLETE" == "1" ]]; then
    if ! rm -rf -- "$INSTALL_WORK_DIR"; then
      printf 'error: installation succeeded but owned temporary staging remains at %s\n' "$INSTALL_WORK_DIR" >&2
      exit 1
    fi
  else
    printf 'bootstrap: candidate evidence preserved at %s (exit %s)\n' "$INSTALL_WORK_DIR" "$status" >&2
  fi
  exit "$status"
}

trap cleanup_install_work_dir EXIT

detect_platform() {
  local os_name
  local arch_name
  local os
  local arch

  os_name="$(uname -s)"
  arch_name="$(uname -m)"

  case "$os_name" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    *) fail "unsupported OS: $os_name (supported: Darwin, Linux)" ;;
  esac

  case "$arch_name" in
    x86_64) arch="x64" ;;
    arm64 | aarch64) arch="arm64" ;;
    *) fail "unsupported architecture: $arch_name (supported: x86_64, arm64, aarch64)" ;;
  esac

  printf '%s-%s\n' "$os" "$arch"
}

resolve_tag() {
  if [[ -n "${KEPLER_VERSION:-}" ]]; then
    printf '%s\n' "$KEPLER_VERSION"
  else
    curl -fsSL "https://api.github.com/repos/$KEPLER_REPO_SLUG/releases/latest" |
      grep -o '"tag_name": "[^"]*"' |
      head -1 |
      cut -d'"' -f4
  fi
}

validate_tag() {
  local tag="$1"
  if [[ ! "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    fail "release tag must be a stable Kepler version such as v3.0.0: $tag"
  fi
}

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    fail "neither sha256sum nor shasum is available"
  fi
}

validate_checksums() {
  local work_dir="$1"
  local archive_name="$2"
  local checksum_file="$work_dir/SHA256SUMS"
  local expected_names=(
    "kepler-$KEPLER_RELEASE-darwin-arm64.tar.gz"
    "kepler-$KEPLER_RELEASE-darwin-x64.tar.gz"
    "kepler-$KEPLER_RELEASE-linux-arm64.tar.gz"
    "kepler-$KEPLER_RELEASE-linux-x64.tar.gz"
    "kepler-core-$KEPLER_RELEASE.tgz"
    "RELEASE-MANIFEST.json"
  )
  local seen_names=()
  local checksum_pattern='^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$'
  local line
  local digest
  local name
  local found=0
  local allowed
  local seen
  local archive_digest=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ ! "$line" =~ $checksum_pattern ]]; then
      fail "SHA256SUMS contains an invalid entry"
    fi
    digest="${BASH_REMATCH[1]}"
    name="${BASH_REMATCH[2]}"
    allowed=0
    for expected in "${expected_names[@]}"; do
      if [[ "$name" == "$expected" ]]; then
        allowed=1
        break
      fi
    done
    if [[ "$allowed" != "1" ]]; then
      fail "SHA256SUMS contains an unexpected asset: $name"
    fi
    for seen in "${seen_names[@]}"; do
      if [[ "$name" == "$seen" ]]; then
        fail "SHA256SUMS contains a duplicate asset: $name"
      fi
    done
    seen_names+=("$name")
    if [[ "$name" == "$archive_name" ]]; then
      archive_digest="$digest"
      found=1
    fi
  done < "$checksum_file"

  if [[ "${#seen_names[@]}" != "${#expected_names[@]}" ]]; then
    fail "SHA256SUMS does not contain the complete release asset set"
  fi
  for expected in "${expected_names[@]}"; do
    found=0
    for seen in "${seen_names[@]}"; do
      if [[ "$seen" == "$expected" ]]; then
        found=1
        break
      fi
    done
    if [[ "$found" != "1" ]]; then
      fail "SHA256SUMS is missing a required asset: $expected"
    fi
  done
  if [[ -z "$archive_digest" ]]; then
    fail "SHA256SUMS does not include the selected target archive"
  fi
  local archive_bytes
  archive_bytes="$(wc -c < "$work_dir/$archive_name")"
  archive_bytes="${archive_bytes//[[:space:]]/}"
  if [[ ! "$archive_bytes" =~ ^[0-9]+$ ]]; then
    fail "target archive size could not be determined"
  fi
  if (( archive_bytes > MAX_COMPRESSED_BYTES )); then
    fail "target archive exceeds the compressed-size limit"
  fi
  if [[ "$(sha256_file "$work_dir/$archive_name")" != "$archive_digest" ]]; then
    fail "target archive checksum does not match SHA256SUMS"
  fi
  printf '%s: OK\n' "$archive_name"
}

validate_archive_members() {
  local archive="$1"
  local work_dir="$2"
  local names_file="$work_dir/archive-members.txt"
  local verbose_file="$work_dir/archive-members-verbose.txt"
  local sorted_names_file="$work_dir/archive-members-sorted.txt"
  local unique_names_file="$work_dir/archive-members-unique.txt"
  local verbose_paths_file="$work_dir/archive-verbose-paths.txt"
  local sorted_verbose_paths_file="$work_dir/archive-verbose-paths-sorted.txt"
  local line
  local name
  local type
  local expanded_bytes
  local expanded_status
  local member_count
  local listing_status
  local verbose_count

  if expanded_bytes="$(gzip -dc "$archive" 2> "$work_dir/archive-gzip.stderr" | head -c "$((MAX_EXPANDED_BYTES + 1))" | wc -c)"; then
    expanded_status=0
  else
    expanded_status=$?
  fi
  expanded_bytes="${expanded_bytes//[[:space:]]/}"
  if [[ ! "$expanded_bytes" =~ ^[0-9]+$ ]]; then
    fail "target archive expanded size could not be determined"
  fi
  if (( expanded_bytes > MAX_EXPANDED_BYTES )); then
    fail "target archive exceeds the expanded-size limit"
  fi
  if (( expanded_status != 0 )); then
    fail "target archive cannot be expanded safely"
  fi

  if tar -tzf "$archive" 2> "$work_dir/tar-list.stderr" | head -n "$((MAX_ARCHIVE_FILES + 1))" > "$names_file"; then
    listing_status=0
  else
    listing_status=$?
  fi
  member_count="$(wc -l < "$names_file")"
  member_count="${member_count//[[:space:]]/}"
  if [[ ! "$member_count" =~ ^[0-9]+$ ]]; then
    fail "target archive member count could not be determined"
  fi
  if (( member_count > MAX_ARCHIVE_FILES )); then
    fail "target archive contains too many members"
  fi
  if (( listing_status != 0 )); then
    fail "target archive cannot be listed safely"
  fi

  while IFS= read -r name || [[ -n "$name" ]]; do
    if [[ ${#name} -gt "$MAX_ARCHIVE_PATH_BYTES" || ! "$name" =~ ^[A-Za-z0-9._/+@-]+$ || "$name" == /* || "$name" == *//* || "$name" == ".." || "$name" == ../* || "$name" == */../* || "$name" == */.. || "$name" == ./* || "$name" == */./* || "$name" == */. ]]; then
      fail "target archive contains an unsafe path: $name"
    fi
    case "$name" in
      bin/kepler | package.json | release-manifest.json | bundle/manifest.json | bundle/*) ;;
      *) fail "target archive contains an unexpected path: $name" ;;
    esac
  done < "$names_file"

  if ! LC_ALL=C sort "$names_file" > "$sorted_names_file" || ! LC_ALL=C sort -u "$names_file" > "$unique_names_file"; then
    fail "target archive paths could not be sorted safely"
  fi
  if ! cmp -s "$sorted_names_file" "$unique_names_file"; then
    fail "target archive contains a duplicate path"
  fi

  if tar -tvzf "$archive" 2> "$work_dir/tar-verbose.stderr" | head -n "$((MAX_ARCHIVE_FILES + 1))" > "$verbose_file"; then
    listing_status=0
  else
    listing_status=$?
  fi
  verbose_count="$(wc -l < "$verbose_file")"
  verbose_count="${verbose_count//[[:space:]]/}"
  if [[ ! "$verbose_count" =~ ^[0-9]+$ ]]; then
    fail "target archive verbose member count could not be determined"
  fi
  if (( verbose_count > MAX_ARCHIVE_FILES )); then
    fail "target archive contains too many members"
  fi
  if (( listing_status != 0 )); then
    fail "target archive member types cannot be inspected"
  fi

  : > "$verbose_paths_file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    type="${line:0:1}"
    name="${line##* }"
    if [[ "$type" != "-" || ${#name} -gt "$MAX_ARCHIVE_PATH_BYTES" || ! "$name" =~ ^[A-Za-z0-9._/+@-]+$ ]]; then
      fail "target archive contains a link, special file, or uninspectable member"
    fi
    printf '%s\n' "$name" >> "$verbose_paths_file"
  done < "$verbose_file"
  if [[ "$verbose_count" != "$member_count" ]]; then
    fail "target archive member listing changed during validation"
  fi
  if ! LC_ALL=C sort "$verbose_paths_file" > "$sorted_verbose_paths_file"; then
    fail "target archive verbose paths could not be sorted safely"
  fi
  if ! cmp -s "$sorted_names_file" "$sorted_verbose_paths_file"; then
    fail "target archive member listing changed during validation"
  fi

  if (( member_count < 4 )); then
    fail "target archive is incomplete or has inconsistent member listings"
  fi
  for required in bin/kepler package.json release-manifest.json bundle/manifest.json; do
    if ! grep -F -x -q "$required" "$names_file"; then
      fail "target archive is missing a required package file: $required"
    fi
  done
}

identity_release_is_safe() {
  local release="$1"
  local component
  local components
  IFS=. read -r -a components <<< "$release"
  [[ "${#components[@]}" == "3" ]] || return 1
  for component in "${components[@]}"; do
    if (( ${#component} > 16 )); then
      return 1
    fi
    if (( ${#component} == 16 && 10#$component > 9007199254740991 )); then
      return 1
    fi
  done
  return 0
}

verify_candidate_identity() {
  local candidate_binary="$1"
  local platform="$2"
  local requested_release="$3"
  local work_dir="$4"
  local identity_output="$work_dir/candidate-identity.stdout"
  local identity_json
  local identity_bytes
  local identity_lines
  local identity_status
  local candidate_release
  local candidate_os
  local candidate_arch
  local expected_os="${platform%%-*}"
  local expected_arch="${platform#*-}"
  local identity_pattern='^\{"format_version":1,"kepler_release":"([0-9]+\.[0-9]+\.[0-9]+)","source":\{"kind":"(production|development)","commit":"([a-f0-9]{40}|[a-f0-9]{64})","content_digest":"sha256:[a-f0-9]{64}"\},"target":\{"os":"(linux|darwin)","arch":"(x64|arm64)"\},"resource_digest":"sha256:[a-f0-9]{64}"\}$'

  if "$candidate_binary" --print-build-identity 2> "$work_dir/candidate-identity.stderr" | head -c "$((MAX_IDENTITY_OUTPUT_BYTES + 1))" > "$identity_output"; then
    identity_status=0
  else
    identity_status=$?
  fi
  identity_bytes="$(wc -c < "$identity_output")"
  identity_bytes="${identity_bytes//[[:space:]]/}"
  if [[ ! "$identity_bytes" =~ ^[0-9]+$ ]]; then
    fail "staged candidate build identity size could not be determined"
  fi
  if (( identity_bytes > MAX_IDENTITY_OUTPUT_BYTES )); then
    fail "staged candidate build identity output exceeds its size limit"
  fi
  if (( identity_status != 0 )); then
    fail "staged candidate build identity could not be read"
  fi
  identity_lines="$(wc -l < "$identity_output")"
  identity_lines="${identity_lines//[[:space:]]/}"
  if [[ "$identity_lines" != "1" ]] || ! IFS= read -r identity_json < "$identity_output"; then
    fail "staged candidate build identity is malformed"
  fi
  if (( identity_bytes != ${#identity_json} + 1 )); then
    fail "staged candidate build identity is malformed"
  fi
  if [[ ! "$identity_json" =~ $identity_pattern ]]; then
    fail "staged candidate build identity is malformed"
  fi
  candidate_release="${BASH_REMATCH[1]}"
  candidate_os="${BASH_REMATCH[4]}"
  candidate_arch="${BASH_REMATCH[5]}"
  if ! identity_release_is_safe "$candidate_release" || [[ "$candidate_release" != "$requested_release" || "$candidate_os" != "$expected_os" || "$candidate_arch" != "$expected_arch" ]]; then
    fail "staged candidate identity does not match the requested release and detected platform"
  fi
}

install_kepler() {
  local platform="$1"
  local tag="$2"
  local work_dir="$3"
  local archive_name="kepler-${KEPLER_RELEASE}-${platform}.tar.gz"
  local candidate_root="$work_dir/candidate"
  local release_url="https://github.com/$KEPLER_REPO_SLUG/releases/download/$tag"
  local setup_status

  printf '==> Detected platform: %s\n' "$platform"
  printf '==> Staging Kepler %s from %s\n' "$KEPLER_RELEASE" "$tag"
  printf '==> Downloading one target archive and release checksums\n'
  curl -fsSL -o "$work_dir/$archive_name" "$release_url/$archive_name"
  curl -fsSL -o "$work_dir/SHA256SUMS" "$release_url/SHA256SUMS"

  printf '==> Verifying complete release checksums\n'
  validate_checksums "$work_dir" "$archive_name"

  printf '==> Inspecting and staging candidate archive\n'
  validate_archive_members "$work_dir/$archive_name" "$work_dir"
  (umask 022; mkdir "$candidate_root"; tar -xzf "$work_dir/$archive_name" -C "$candidate_root")

  if [[ ! -f "$candidate_root/bin/kepler" || -L "$candidate_root/bin/kepler" || ! -x "$candidate_root/bin/kepler" ]]; then
    fail "staged candidate does not contain an executable regular Kepler binary"
  fi
  printf '==> Verifying the staged candidate release and target identity\n'
  verify_candidate_identity "$candidate_root/bin/kepler" "$platform" "$KEPLER_RELEASE" "$work_dir"
  printf '==> Invoking candidate setup; setup alone owns activation\n'
  if "$candidate_root/bin/kepler" setup; then
    INSTALL_COMPLETE=1
    printf '==> Candidate setup completed\n'
  else
    setup_status=$?
    printf 'error: candidate setup failed with exit code %s; bootstrap performed no selector or launcher promotion\n' "$setup_status" >&2
    exit "$setup_status"
  fi
}

main() {
  local platform
  local tag
  local work_dir

  if [[ ! "$KEPLER_REPO_SLUG" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    fail "invalid GitHub repository slug: $KEPLER_REPO_SLUG"
  fi
  platform="$(detect_platform)"
  tag="$(resolve_tag)"
  validate_tag "$tag"
  KEPLER_RELEASE="${tag#v}"
  work_dir="$(mktemp -d "${TMPDIR:-/tmp}/kepler-bootstrap.XXXXXXXX")" || fail "could not create a private temporary staging directory"
  INSTALL_WORK_DIR="$work_dir"
  INSTALL_WORK_IDENTITY="$(directory_identity "$work_dir")" || fail "could not record staging directory ownership"
  install_kepler "$platform" "$tag" "$work_dir"
}

main "$@"

# Changelog


## [1.0.1] — 2026-06-17

### Fixed

- Replaced non-existent `cortex/plugins` import with local `types.ts` containing inline type definitions
- Removed broken `cortex/plugins` import map from `deno.json`
- Fixed test files with complete mock contexts (`state.delete`, `state.list`, `config.get/set/getAll`, `logger`, `host`)
- Rewrote scaffold test files to test actual plugin tools instead of template leftovers
- Added `defaultValue` and `default` fields to `ToolParam` type for compatibility

## [1.0.0] — 2026-06-15

### Added

- Initial release
- `apitest_generate` — Generate tests from OpenAPI specs
- `apitest_run` — Run generated tests
- `apitest_validate_spec` — Validate specs
- `apitest_list_endpoints` — List endpoints
- `apitest_mock_server` — Start mock server

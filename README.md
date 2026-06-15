# cortex-plugin-api-test-generator

Generate test suites from OpenAPI specifications.

## Installation

```bash
cortex plugin install marketplace:cortex-plugin-api-test-generator
cortex plugin install github:CortexPrism/cortex-plugin-api-test-generator
cortex plugin install ./manifest.json
```

## Tools

### apitest_generate
Generate tests from an OpenAPI spec.
- `spec` (string, required) — URL or file path to OpenAPI spec
- `framework` (string, default: "vitest") — jest, vitest, pytest, go_test, supertest
- `output_dir` (string, required) — Directory to write generated tests

### apitest_run
Run generated tests.
- `test_dir` (string, required) — Directory containing tests
- `framework` (string, optional) — Test framework

### apitest_validate_spec
Validate an OpenAPI specification.
- `spec` (string, required) — URL or file path to OpenAPI spec

### apitest_list_endpoints
List endpoints from an OpenAPI spec.
- `spec` (string, required) — URL or file path to OpenAPI spec

### apitest_mock_server
Start a mock server from an OpenAPI spec.
- `spec` (string, required) — URL or file path to OpenAPI spec
- `port` (number, default: 3000) — Port to run on

## Configuration

Set the default test framework under the "General" section in plugin settings.

## Development

```bash
deno cache mod.ts
deno task test
deno fmt
deno lint
```

## License

MIT

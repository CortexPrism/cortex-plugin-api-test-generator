import type { PluginContext, Tool, ToolCallResult, ToolContext } from './types.ts';

let config: Record<string, string> = {};

export async function onLoad(ctx: PluginContext): Promise<void> {
  config = await ctx.config.get() as Record<string, string>;
}

export async function onUnload(_ctx: PluginContext): Promise<void> {}

async function fetchSpec(spec: string): Promise<string> {
  if (spec.startsWith('http://') || spec.startsWith('https://')) {
    const res = await fetch(spec);
    if (!res.ok) throw new Error(`Failed to fetch spec: HTTP ${res.status}`);
    return res.text();
  }
  try {
    return Deno.readTextFileSync(spec);
  } catch {
    throw new Error(`Cannot read spec file: ${spec}`);
  }
}

function parseSpec(raw: string): Record<string, unknown> {
  const spec = JSON.parse(raw);
  if (!spec || typeof spec !== 'object') throw new Error('Invalid OpenAPI spec: not a JSON object');
  return spec;
}

const apitest_generate: Tool = {
  definition: {
    name: 'apitest_generate',
    description: 'Generate tests from an OpenAPI spec',
    params: [
      {
        name: 'spec',
        type: 'string',
        description: 'URL or file path to OpenAPI spec',
        required: true,
      },
      {
        name: 'framework',
        type: 'string',
        description: 'Test framework to generate for',
        required: false,
        enum: ['jest', 'vitest', 'pytest', 'go_test', 'supertest'],
        default: 'vitest',
      },
      {
        name: 'output_dir',
        type: 'string',
        description: 'Directory to write generated tests',
        required: true,
      },
    ],
    capabilities: ['network:fetch', 'fs:write'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const specArg = args.spec;
      const output_dir = args.output_dir;
      if (!specArg || typeof specArg !== 'string') {
        return {
          toolName: 'apitest_generate',
          success: false,
          output: '',
          error: 'spec must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }
      if (!output_dir || typeof output_dir !== 'string') {
        return {
          toolName: 'apitest_generate',
          success: false,
          output: '',
          error: 'output_dir must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }
      const framework = typeof args.framework === 'string'
        ? args.framework
        : (config.defaultFramework || 'vitest');
      const raw = await fetchSpec(specArg);
      const specObj = parseSpec(raw);
      const info = (specObj.info as Record<string, unknown>) || {};
      const title = (info.title as string) || 'api';
      const paths = (specObj.paths as Record<string, Record<string, Record<string, unknown>>>) ||
        {};

      const extMap: Record<string, string> = {
        jest: 'test.ts',
        vitest: 'test.ts',
        pytest: 'test.py',
        go_test: '_test.go',
        supertest: 'test.ts',
      };
      const ext = extMap[framework] || 'test.ts';
      const fwId = framework === 'go_test'
        ? 'go_test'
        : framework === 'pytest'
        ? 'pytest'
        : 'vitest';
      const filename = `${fwId}_${title.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;

      let code = '';
      if (framework === 'pytest') {
        code = `import pytest\nimport requests\n\nBASE_URL = "http://localhost:3000"\n\n`;
        for (const [path, methods] of Object.entries(paths)) {
          for (const [method] of Object.entries(methods)) {
            code += `\ndef test_${method}_${
              path.replace(/[/{}]/g, '_')
            }():\n    response = requests.${method}("$" + "{BASE_URL}${path}")\n    assert response.status_code in [200, 201, 204]\n`;
          }
        }
      } else if (framework === 'go_test') {
        code =
          `package main\n\nimport (\n\t"testing"\n\t"net/http"\n)\n\nconst baseURL = "http://localhost:3000"\n\n`;
        for (const [path, methods] of Object.entries(paths)) {
          for (const [method] of Object.entries(methods)) {
            const name = `${method}_${path.replace(/[/{}]/g, '_')}`;
            code +=
              `\nfunc Test${name}(t *testing.T) {\n\treq, _ := http.NewRequest("${method.toUpperCase()}", baseURL+"${path}", nil)\n\tresp, err := http.DefaultClient.Do(req)\n\tif err != nil { t.Fatal(err) }\n\tdefer resp.Body.Close()\n\tif resp.StatusCode < 200 || resp.StatusCode > 299 { t.Errorf("expected 2xx, got %d", resp.StatusCode) }\n}\n`;
          }
        }
      } else if (framework === 'supertest') {
        code = `import request from "supertest";\n\nconst app = "http://localhost:3000";\n\n`;
        for (const [path, methods] of Object.entries(paths)) {
          for (const [method] of Object.entries(methods)) {
            code +=
              `\ndescribe("${method.toUpperCase()} ${path}", () => {\n  it("should respond with 2xx", async () => {\n    const res = await request(app).${method.toLowerCase()}("${path}");\n    expect(res.status).toBeGreaterThanOrEqual(200);\n    expect(res.status).toBeLessThan(300);\n  });\n});\n`;
          }
        }
      } else {
        code = `import { describe, it, expect } from "${
          framework === 'vitest' ? 'vitest' : '@jest/globals'
        }";\n\nconst BASE_URL = "http://localhost:3000";\n\n`;
        for (const [path, methods] of Object.entries(paths)) {
          for (const [method] of Object.entries(methods)) {
            code +=
              `\ndescribe("${method.toUpperCase()} ${path}", () => {\n  it("should respond with 2xx", async () => {\n    const res = await fetch("$" + "{BASE_URL}${path}", { method: "${method.toUpperCase()}" });\n    expect(res.ok).toBe(true);\n  });\n});\n`;
          }
        }
      }

      try {
        Deno.mkdirSync(output_dir, { recursive: true });
      } catch { /* dir exists */ }
      const filePath = `${output_dir}/${filename}`;
      Deno.writeTextFileSync(filePath, code);

      return {
        toolName: 'apitest_generate',
        success: true,
        output: `Generated ${
          Object.keys(paths).length
        } endpoint tests for framework "${framework}" at ${filePath}`,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'apitest_generate',
        success: false,
        output: '',
        error: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const apitest_run: Tool = {
  definition: {
    name: 'apitest_run',
    description: 'Run generated tests',
    params: [
      {
        name: 'test_dir',
        type: 'string',
        description: 'Directory containing generated tests',
        required: true,
      },
      { name: 'framework', type: 'string', description: 'Test framework to use', required: false },
    ],
    capabilities: ['shell:run'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const test_dir = args.test_dir;
      if (!test_dir || typeof test_dir !== 'string') {
        return {
          toolName: 'apitest_run',
          success: false,
          output: '',
          error: 'test_dir must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }
      const framework = typeof args.framework === 'string'
        ? args.framework
        : (config.defaultFramework || 'vitest');
      const cmdMap: Record<string, string> = {
        vitest: `npx vitest run ${test_dir}`,
        jest: `npx jest ${test_dir}`,
        pytest: `python -m pytest ${test_dir}`,
        go_test: `go test ${test_dir}`,
        supertest: `npx jest ${test_dir}`,
      };
      const cmd = cmdMap[framework] || cmdMap['vitest'];
      const proc = new Deno.Command('sh', { args: ['-c', cmd], stdout: 'piped', stderr: 'piped' });
      const { stdout, stderr } = await proc.output();
      const out = new TextDecoder().decode(stdout);
      const err = new TextDecoder().decode(stderr);
      const output = out + (err ? `\n${err}` : '');
      return { toolName: 'apitest_run', success: true, output, durationMs: Date.now() - start };
    } catch (error) {
      return {
        toolName: 'apitest_run',
        success: false,
        output: '',
        error: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const apitest_validate_spec: Tool = {
  definition: {
    name: 'apitest_validate_spec',
    description: 'Validate an OpenAPI specification',
    params: [
      {
        name: 'spec',
        type: 'string',
        description: 'URL or file path to OpenAPI spec',
        required: true,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const specArg = args.spec;
      if (!specArg || typeof specArg !== 'string') {
        return {
          toolName: 'apitest_validate_spec',
          success: false,
          output: '',
          error: 'spec must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }
      const raw = await fetchSpec(specArg);
      const specObj = JSON.parse(raw);
      const errors: string[] = [];
      if (!specObj.openapi) errors.push("Missing 'openapi' version field");
      if (!specObj.info) errors.push("Missing 'info' object");
      if (!specObj.paths) errors.push("Missing 'paths' object");
      if (errors.length > 0) {
        return {
          toolName: 'apitest_validate_spec',
          success: false,
          output: '',
          error: `Validation errors: ${errors.join('; ')}`,
          durationMs: Date.now() - start,
        };
      }
      const pathsCount = Object.keys(specObj.paths).length;
      return {
        toolName: 'apitest_validate_spec',
        success: true,
        output: `Valid OpenAPI ${specObj.openapi} spec with ${pathsCount} paths`,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'apitest_validate_spec',
        success: false,
        output: '',
        error: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const apitest_list_endpoints: Tool = {
  definition: {
    name: 'apitest_list_endpoints',
    description: 'List endpoints from an OpenAPI spec',
    params: [
      {
        name: 'spec',
        type: 'string',
        description: 'URL or file path to OpenAPI spec',
        required: true,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const specArg = args.spec;
      if (!specArg || typeof specArg !== 'string') {
        return {
          toolName: 'apitest_list_endpoints',
          success: false,
          output: '',
          error: 'spec must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }
      const raw = await fetchSpec(specArg);
      const specObj = parseSpec(raw);
      const paths = (specObj.paths as Record<string, Record<string, Record<string, unknown>>>) ||
        {};
      const lines: string[] = [];
      for (const [path, methods] of Object.entries(paths)) {
        for (const method of Object.keys(methods)) {
          lines.push(`${method.toUpperCase()} ${path}`);
        }
      }
      return {
        toolName: 'apitest_list_endpoints',
        success: true,
        output: lines.join('\n'),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'apitest_list_endpoints',
        success: false,
        output: '',
        error: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const apitest_mock_server: Tool = {
  definition: {
    name: 'apitest_mock_server',
    description: 'Start a mock server from an OpenAPI spec',
    params: [
      {
        name: 'spec',
        type: 'string',
        description: 'URL or file path to OpenAPI spec',
        required: true,
      },
      {
        name: 'port',
        type: 'number',
        description: 'Port to run the mock server on',
        required: false,
        default: 3000,
      },
    ],
    capabilities: ['network:fetch', 'shell:run'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const specArg = args.spec;
      const port = typeof args.port === 'number' ? args.port : 3000;
      if (!specArg || typeof specArg !== 'string') {
        return {
          toolName: 'apitest_mock_server',
          success: false,
          output: '',
          error: 'spec must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }
      const raw = await fetchSpec(specArg);
      const specObj = parseSpec(raw);

      let serverCode = `import { serve } from "https://deno.land/std@0.208.0/http/server.ts";\n`;
      serverCode += `const spec = ${JSON.stringify(specObj)};\n`;
      serverCode += `const paths = spec.paths || {};\n`;
      serverCode += `const handler = (req: Request): Response => {\n`;
      serverCode += `  const url = new URL(req.url);\n`;
      serverCode += `  const match = paths[url.pathname];\n`;
      serverCode +=
        `  if (!match) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });\n`;
      serverCode += `  const methodEntry = match[req.method.toLowerCase()];\n`;
      serverCode +=
        `  if (!methodEntry) return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });\n`;
      serverCode +=
        `  const schema = (methodEntry.responses?.["200"] || methodEntry.responses?.["201"])?.content?.["application/json"]?.schema;\n`;
      serverCode += `  const sample: Record<string, unknown> = {};\n`;
      serverCode += `  if (schema?.properties) {\n`;
      serverCode += `    for (const [k, v] of Object.entries(schema.properties)) {\n`;
      serverCode += `      const prop = v as Record<string, unknown>;\n`;
      serverCode += `      if (prop.example !== undefined) sample[k] = prop.example;\n`;
      serverCode += `      else if (prop.type === "string") sample[k] = "sample";\n`;
      serverCode +=
        `      else if (prop.type === "number" || prop.type === "integer") sample[k] = 0;\n`;
      serverCode += `      else if (prop.type === "boolean") sample[k] = true;\n`;
      serverCode += `      else sample[k] = null;\n`;
      serverCode += `    }\n`;
      serverCode += `  }\n`;
      serverCode +=
        `  return new Response(JSON.stringify(sample), { status: 200, headers: { "Content-Type": "application/json" } });\n`;
      serverCode += `};\n`;
      serverCode += `serve(handler, { port: ${port} });\n`;

      const tmpFile = `/tmp/cortexprism_mock_server_${port}.ts`;
      Deno.writeTextFileSync(tmpFile, serverCode);

      const proc = new Deno.Command('deno', {
        args: ['run', '--allow-net', tmpFile],
        stdout: 'null',
        stderr: 'null',
        stdin: 'null',
      });
      proc.spawn();

      return {
        toolName: 'apitest_mock_server',
        success: true,
        output: `Mock server started on http://localhost:${port}`,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'apitest_mock_server',
        success: false,
        output: '',
        error: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export const tools: Tool[] = [
  apitest_generate,
  apitest_run,
  apitest_validate_spec,
  apitest_list_endpoints,
  apitest_mock_server,
];

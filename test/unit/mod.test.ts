import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { tools } from '../../mod.ts';
import type { PluginContext, ToolContext } from '../../types.ts';

// Mock PluginContext
const mockContext: PluginContext & ToolContext = {
  pluginId: 'cortex-plugin-api-test-generator',
  pluginDir: '/tmp/plugins/cortex-plugin-api-test-generator',
  state: {
    get: async () => null,
    set: async () => {},
    delete: async () => {},
    list: async () => ({}),
  },
  config: {
    get: async () => null,
    set: async () => {},
    getAll: async () => ({}),
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
  host: {
    registerTool: () => {},
    unregisterTool: () => {},
  },
  sessionId: 'test-session',
  workingDir: '/tmp',
  agentId: 'test-agent',
  workspaceDir: '/tmp',
};

function findTool(name: string) {
  const tool = tools.find((t) => t.definition.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

Deno.test('tools array — exports all tools', () => {
  assertEquals(tools.length, 5);
  assertEquals(tools[0].definition.name, 'apitest_generate');
  assertEquals(tools[1].definition.name, 'apitest_run');
  assertEquals(tools[2].definition.name, 'apitest_validate_spec');
  assertEquals(tools[3].definition.name, 'apitest_list_endpoints');
  assertEquals(tools[4].definition.name, 'apitest_mock_server');
});

Deno.test('apitest_generate — rejects empty spec', async () => {
  const tool = findTool('apitest_generate');
  const result = await tool.execute({ 'spec': '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'non-empty string');
});

Deno.test('apitest_run — rejects empty test_dir', async () => {
  const tool = findTool('apitest_run');
  const result = await tool.execute({ 'test_dir': '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'non-empty string');
});

Deno.test('apitest_validate_spec — rejects empty spec', async () => {
  const tool = findTool('apitest_validate_spec');
  const result = await tool.execute({ 'spec': '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'non-empty string');
});

Deno.test('apitest_list_endpoints — rejects empty spec', async () => {
  const tool = findTool('apitest_list_endpoints');
  const result = await tool.execute({ 'spec': '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'non-empty string');
});

Deno.test('apitest_mock_server — rejects empty spec', async () => {
  const tool = findTool('apitest_mock_server');
  const result = await tool.execute({ 'spec': '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'non-empty string');
});

Deno.test('all tools return durationMs', async () => {
  for (const tool of tools) {
    const args: Record<string, unknown> = {};
    const result = await tool.execute(args, mockContext);
    assertEquals(typeof result.durationMs, 'number');
    assertEquals(result.durationMs >= 0, true);
  }
});

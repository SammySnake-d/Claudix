/**
 * 服务测试 / Services Tests
 */

import { describe, it, expect } from 'vitest';
import { InstantiationServiceBuilder } from '../src/di/instantiationServiceBuilder';
import { registerServices } from '../src/services/serviceRegistry';
import { ILogService } from '../src/services/logService';
import { ExtensionMode } from './mocks/vscode';

// Mock extension context for testing
const mockContext = {
	extensionMode: ExtensionMode.Test,
	subscriptions: [],
	extensionUri: { fsPath: '/test' },
	extensionPath: '/test',
	globalState: { get: () => undefined, update: () => Promise.resolve() },
	workspaceState: { get: () => undefined, update: () => Promise.resolve() },
	secrets: { get: () => Promise.resolve(undefined), store: () => Promise.resolve(), delete: () => Promise.resolve() },
	storageUri: undefined,
	globalStorageUri: { fsPath: '/test/global' },
	logUri: { fsPath: '/test/log' }
} as any;

describe('Services', () => {
	it('should register and retrieve log service', () => {
		const builder = new InstantiationServiceBuilder();
		registerServices(builder, mockContext);

		const instantiationService = builder.seal();

		instantiationService.invokeFunction(accessor => {
			const logService = accessor.get(ILogService);
			expect(logService).toBeDefined();

			// 测试日志方法不抛出异常
			expect(() => {
				logService.info('Test message');
				logService.warn('Warning');
				logService.error('Error');
			}).not.toThrow();
		});
	});
});

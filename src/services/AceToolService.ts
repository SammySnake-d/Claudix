/**
 * AceToolService - Service for interacting with ace-tool-rs
 */

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';
import { IConfigurationService } from './configurationService';

export const IAceToolService = createDecorator<IAceToolService>('aceToolService');

export interface IAceToolService {
    readonly _serviceBrand: undefined;
    enhancePrompt(text: string): Promise<string>;
}

export class AceToolService implements IAceToolService {
    readonly _serviceBrand: undefined;

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService
    ) {}

    async enhancePrompt(text: string): Promise<string> {
        this.logService.info('[AceToolService] Enhancing prompt...');

        const config = vscode.workspace.getConfiguration('claudix.aceTool');
        const command = config.get<string>('command', 'npx ace-tool-rs');

        // Environment variables
        const env = { ...process.env };

        // Enhance settings
        const endpoint = config.get<string>('enhancerEndpoint', 'new');
        const baseUrl = config.get<string>('baseUrl', '');
        const token = config.get<string>('token', '');
        const model = config.get<string>('model', '');

        if (endpoint) env['ACE_ENHANCER_ENDPOINT'] = endpoint;
        if (baseUrl) env['PROMPT_ENHANCER_BASE_URL'] = baseUrl;
        if (token) env['PROMPT_ENHANCER_TOKEN'] = token;
        if (model) env['PROMPT_ENHANCER_MODEL'] = model;

        // Construct arguments
        // ace-tool-rs --enhance-prompt "text"
        // Note: Splitting command if it contains spaces (e.g. "npx ace-tool-rs")
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = [...parts.slice(1), '--enhance-prompt', text];

        // Also add base-url and token as CLI args if using 'new' endpoint (default) which often needs them as main args too?
        // Based on docs: "For --enhance-prompt mode with third-party endpoints, --base-url and --token are optional"
        // But for "new" (default), they correspond to the indexing service usually.
        // If the user configured baseUrl/token in settings, we pass them as env vars.
        // If ace-tool-rs requires them as CLI flags for the default endpoint, we might need to add them.
        // Assuming env vars are sufficient or user adds flags to "command" if needed.
        // Actually, let's pass them as CLI args if they are set and we are not using third-party which might confuse things.
        // But the docs say: "For MCP server mode, --base-url and --token are still required".
        // For enhance-prompt: "Uses --base-url and --token CLI args" for new/old endpoints.

        if ((endpoint === 'new' || endpoint === 'old') && baseUrl) {
             args.push('--base-url', baseUrl);
        }
        if ((endpoint === 'new' || endpoint === 'old') && token) {
             args.push('--token', token);
        }

        this.logService.info(`[AceToolService] Running: ${cmd} ${args.join(' ')}`);

        return new Promise((resolve, reject) => {
            const process = child_process.spawn(cmd, args, {
                env,
                shell: true // Use shell to handle npx resolution better on some systems
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    this.logService.info('[AceToolService] Success');
                    resolve(stdout.trim());
                } else {
                    this.logService.error(`[AceToolService] Failed with code ${code}`);
                    this.logService.error(`Stderr: ${stderr}`);
                    reject(new Error(`AceTool failed: ${stderr || 'Unknown error'}`));
                }
            });

            process.on('error', (err) => {
                this.logService.error(`[AceToolService] Spawn error: ${err}`);
                reject(err);
            });
        });
    }
}

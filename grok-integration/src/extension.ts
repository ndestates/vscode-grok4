import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { encode } from 'gpt-tokenizer';
import { marked } from 'marked';

// Setup DOMPurify with JSDOM
const { window: jsdomWindow } = new JSDOM('');
const purify = DOMPurify(jsdomWindow as any);

// Global rate limiting
declare global {
  var __grokApiRateLimit: { count: number; reset: number } | undefined;
}

// Constants
const LICENSE_KEY_PREFIX = 'GI';
const LICENSE_PRODUCT_ID = 'grok-integration';
const MAX_REQUESTS_PER_MINUTE = 5;
const MAX_TOKENS = 4096; // Adjust based on model limits

// Helper: Store/retrieve license key using configuration
function getLicenseKey(): string | undefined {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  return config.get<string>('licenseKey');
}

async function storeLicenseKey(licenseKey: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('grokIntegration');
  try {
    await config.update('licenseKey', licenseKey, vscode.ConfigurationTarget.Global);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to store license: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// License generation and validation
function generateLicenseKey(email: string): string {
  const data = `${email}-${LICENSE_PRODUCT_ID}`;
  const hmac = crypto.createHmac('sha256', 'secure-server-side-secret'); // Use env var or secret for production
  const hash = hmac.update(data).digest('hex');
  const segments = [hash.substring(0, 8), hash.substring(8, 16), hash.substring(16, 24)];
  return `${LICENSE_KEY_PREFIX}-${segments.join('-').toUpperCase()}`;
}

function validateLicenseKey(licenseKey: string): boolean {
  if (!licenseKey || !licenseKey.startsWith(LICENSE_KEY_PREFIX + '-')) return false;
  const keyPattern = new RegExp(`^${LICENSE_KEY_PREFIX}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$`, 'i');
  if (!keyPattern.test(licenseKey)) return false;
  // Optional: Add HMAC verification here for security
  return true;
}

async function checkLicenseStatus(depth = 0): Promise<boolean> {
  if (depth > 3) {
    vscode.window.showErrorMessage('License prompt loop detected. Please restart VS Code.');
    return false;
  }
  const licenseKey = getLicenseKey();
  if (!licenseKey) {
    const action = await vscode.window.showInformationMessage(
      'No license found. Use demo mode?',
      'Yes, Use Demo',
      'Enter Key'
    );
    if (action === 'Yes, Use Demo') {
      const demoKey = generateLicenseKey('demo@example.com');
      await storeLicenseKey(demoKey);
      vscode.window.showInformationMessage('✅ Demo license activated!');
      return true;
    } else if (action === 'Enter Key') {
      await promptForLicenseKey();
      return checkLicenseStatus(depth + 1);
    }
    return false;
  }

  const isValid = validateLicenseKey(licenseKey);
  if (!isValid) {
    const action = await vscode.window.showErrorMessage('❌ Invalid License', 'Reset to Demo', 'Enter New Key', 'Contact Support');
    if (action === 'Reset to Demo') {
      const demoKey = generateLicenseKey('demo@example.com');
      await storeLicenseKey(demoKey);
      vscode.window.showInformationMessage('✅ Demo license activated!');
      return true;
    } else if (action === 'Enter New Key') {
      await promptForLicenseKey();
      return checkLicenseStatus(depth + 1);
    } else if (action === 'Contact Support') {
      vscode.env.openExternal(vscode.Uri.parse('mailto:support@your-website.com'));
    }
    return false;
  }
  return true;
}

async function promptForLicenseKey(depth = 0): Promise<void> {
  if (depth > 3) return;
  const licenseKey = await vscode.window.showInputBox({
    prompt: 'Enter your Grok Integration license key',
    placeHolder: 'GI-XXXXXXXX-XXXXXXXX-XXXXXXXX',
    ignoreFocusOut: true
  });

  if (licenseKey) {
    if (validateLicenseKey(licenseKey)) {
      await storeLicenseKey(licenseKey);
      vscode.window.showInformationMessage('✅ License key validated successfully!');
    } else {
      const action = await vscode.window.showErrorMessage('❌ Invalid key', 'Use Demo', 'Try Again');
      if (action === 'Use Demo') {
        const demoKey = generateLicenseKey('demo@example.com');
        await storeLicenseKey(demoKey);
        vscode.window.showInformationMessage('✅ Demo license activated!');
      } else if (action === 'Try Again') {
        await promptForLicenseKey(depth + 1);
      }
    }
  }
}
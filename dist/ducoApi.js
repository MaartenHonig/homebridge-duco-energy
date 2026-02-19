"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DucoApiClient = void 0;
const axios_1 = __importDefault(require("axios"));
// ── API Client ───────────────────────────────────────────────────────────────
class DucoApiClient {
    constructor(host, port = 80) {
        this.baseUrl = `http://${host}:${port}`;
        this.client = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            headers: { 'Accept': 'application/json' },
        });
    }
    // ── Info endpoints ──────────────────────────────────────────────────────
    /**
     * Get all node info — returns sensor readings, ventilation state, etc.
     * This is the primary polling endpoint.
     */
    async getNodes() {
        try {
            const resp = await this.client.get('/info/nodes');
            // The API may return { Nodes: [...] } or just [...]
            const data = resp.data;
            if (data.Nodes)
                return data.Nodes;
            if (Array.isArray(data))
                return data;
            // Fallback: try alternative endpoint structure
            const resp2 = await this.client.get('/nodes');
            const data2 = resp2.data;
            if (data2.Nodes)
                return data2.Nodes;
            if (Array.isArray(data2))
                return data2;
            return [];
        }
        catch (err) {
            throw new Error(`Failed to get nodes: ${err.message}`);
        }
    }
    /**
     * Get info for a specific node
     */
    async getNodeInfo(nodeId) {
        try {
            const resp = await this.client.get(`/info/nodes/${nodeId}`);
            return resp.data;
        }
        catch (err) {
            throw new Error(`Failed to get node ${nodeId}: ${err.message}`);
        }
    }
    /**
     * Get system info (board serial, firmware versions, etc.)
     */
    async getSystemInfo() {
        try {
            const resp = await this.client.get('/info');
            return resp.data;
        }
        catch (err) {
            throw new Error(`Failed to get system info: ${err.message}`);
        }
    }
    // ── Action endpoints ────────────────────────────────────────────────────
    /**
     * Get supported actions for the whole device
     */
    async getActions() {
        try {
            const resp = await this.client.get('/action');
            return resp.data.Actions || resp.data || [];
        }
        catch (err) {
            throw new Error(`Failed to get actions: ${err.message}`);
        }
    }
    /**
     * Get supported actions for a specific node
     */
    async getNodeActions(nodeId) {
        try {
            const resp = await this.client.get(`/action/${nodeId}`);
            return resp.data.Actions || resp.data || [];
        }
        catch (err) {
            throw new Error(`Failed to get node actions for ${nodeId}: ${err.message}`);
        }
    }
    /**
     * Send an action to the whole device (e.g. set ventilation mode)
     */
    async sendAction(action, value) {
        try {
            await this.client.post('/action', {
                Action: action,
                Val: value,
            });
        }
        catch (err) {
            throw new Error(`Failed to send action ${action}: ${err.message}`);
        }
    }
    /**
     * Send an action to a specific node
     */
    async sendNodeAction(nodeId, action, value) {
        try {
            await this.client.post(`/action/${nodeId}`, {
                Action: action,
                Val: value,
            });
        }
        catch (err) {
            throw new Error(`Failed to send action ${action} to node ${nodeId}: ${err.message}`);
        }
    }
    // ── Config endpoints ────────────────────────────────────────────────────
    /**
     * Get configuration for a specific node
     */
    async getNodeConfig(nodeId) {
        try {
            const resp = await this.client.get(`/config/nodes/${nodeId}`);
            return resp.data;
        }
        catch (err) {
            throw new Error(`Failed to get config for node ${nodeId}: ${err.message}`);
        }
    }
    // ── Health ──────────────────────────────────────────────────────────────
    /**
     * Check API health — useful for verifying connectivity
     */
    async checkHealth() {
        try {
            const resp = await this.client.get('/health');
            return resp.status === 200;
        }
        catch {
            return false;
        }
    }
    /**
     * Attempt auto-discovery of API structure.
     * The local API might vary slightly between firmware versions.
     * This method tries common endpoint patterns and returns what works.
     */
    async discoverEndpoints() {
        const infoPaths = ['/info/nodes', '/nodes', '/info'];
        const actionPaths = ['/action', '/actions'];
        let infoEndpoint = '/info/nodes';
        let actionEndpoint = '/action';
        for (const path of infoPaths) {
            try {
                const resp = await this.client.get(path);
                if (resp.status === 200 && resp.data) {
                    infoEndpoint = path;
                    break;
                }
            }
            catch { /* try next */ }
        }
        for (const path of actionPaths) {
            try {
                const resp = await this.client.get(path);
                if (resp.status === 200) {
                    actionEndpoint = path;
                    break;
                }
            }
            catch { /* try next */ }
        }
        return { infoEndpoint, actionEndpoint };
    }
}
exports.DucoApiClient = DucoApiClient;

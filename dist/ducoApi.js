"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DucoApiClient = void 0;
const axios_1 = __importDefault(require("axios"));
// ─── API Client ─────────────────────────────────────────────────────────────
class DucoApiClient {
    constructor(host) {
        this.baseUrl = `http://${host}`;
        this.client = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });
    }
    /**
     * Get system info including temperatures and filter status
     * This is the /info endpoint (not /info/nodes)
     */
    async getSystemInfo() {
        const response = await this.client.get('/info');
        return response.data;
    }
    /**
     * Get API info / health check
     */
    async getApiInfo() {
        const response = await this.client.get('/info');
        return response.data;
    }
    /**
     * Get all nodes with their current state and sensor data
     */
    async getNodes() {
        const response = await this.client.get('/info/nodes');
        return response.data;
    }
    /**
     * Get info for a specific node
     */
    async getNodeInfo(nodeId) {
        const response = await this.client.get(`/info/nodes/${nodeId}`);
        return response.data;
    }
    /**
     * Get supported actions for the device
     */
    async getActions() {
        const response = await this.client.get('/action');
        return response.data;
    }
    /**
     * Get supported actions for a specific node
     */
    async getNodeActions(nodeId) {
        const response = await this.client.get(`/action/nodes/${nodeId}`);
        return response.data;
    }
    /**
     * Send an action to the whole device (e.g., set ventilation mode)
     */
    async sendAction(action, value) {
        await this.client.post('/action', {
            Action: action,
            Val: value,
        });
    }
    /**
     * Send an action to a specific node (e.g., override a specific zone)
     */
    async sendNodeAction(nodeId, action, value) {
        await this.client.post(`/action/nodes/${nodeId}`, {
            Action: action,
            Val: value,
        });
    }
    /**
     * Get all config
     */
    async getConfig() {
        const response = await this.client.get('/config');
        return response.data;
    }
    /**
     * Get config for a specific node
     */
    async getNodeConfig(nodeId) {
        const response = await this.client.get(`/config/nodes/${nodeId}`);
        return response.data;
    }
    /**
     * Set ventilation state for a node
     * States: AUTO, MAN1, MAN2, MAN3, AWAY
     */
    async setNodeVentilationState(nodeId, state) {
        await this.sendNodeAction(nodeId, 'SetVentilationState', state);
    }
    /**
     * Set ventilation state for the whole box
     */
    async setVentilationState(state) {
        await this.sendAction('SetVentilationState', state);
    }
    /**
     * Test connectivity to the Duco box
     */
    async testConnection() {
        try {
            await this.getApiInfo();
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.DucoApiClient = DucoApiClient;

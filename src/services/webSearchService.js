"use strict";
//--------------------------------------------------------------
// FILE: src/services/webSearchService.ts
// Web Search Service using Exa API
//--------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSearchService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_js_1 = require("../utils/logger.js");
class WebSearchService {
    constructor(apiKey) {
        this.baseUrl = "https://api.exa.ai/search";
        this.apiKey = apiKey;
    }
    async search(args) {
        try {
            logger_js_1.logger.info(`🔍 [WebSearch] Searching for: "${args.query.substring(0, 100)}"`);
            const requestBody = {
                query: args.query,
                numResults: args.num_results || 10,
                contents: {
                    text: args.include_text || false,
                    highlights: true,
                    summary: true,
                },
            };
            // Add optional filters
            if (args.category) {
                requestBody.category = args.category;
            }
            if (args.include_domains && args.include_domains.length > 0) {
                requestBody.includeDomains = args.include_domains;
            }
            if (args.exclude_domains && args.exclude_domains.length > 0) {
                requestBody.excludeDomains = args.exclude_domains;
            }
            if (args.start_published_date) {
                requestBody.startPublishedDate = args.start_published_date;
            }
            if (args.end_published_date) {
                requestBody.endPublishedDate = args.end_published_date;
            }
            if (args.user_location) {
                requestBody.userLocation = args.user_location;
            }
            const response = await axios_1.default.post(this.baseUrl, requestBody, {
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": this.apiKey,
                },
                timeout: 30000,
            });
            if (!response.data || !response.data.results) {
                logger_js_1.logger.warn("[WebSearch] No results returned from Exa API");
                return { success: true, results: [] };
            }
            const results = response.data.results.map((r) => ({
                title: r.title || "Untitled",
                url: r.url,
                publishedDate: r.publishedDate,
                author: r.author,
                score: r.score,
                summary: r.summary,
                highlights: r.highlights || [],
                text: r.text,
            }));
            logger_js_1.logger.info(`✅ [WebSearch] Found ${results.length} results`);
            return { success: true, results };
        }
        catch (err) {
            logger_js_1.logger.error(`❌ [WebSearch] Search failed: ${err.message}`);
            if (err.response) {
                logger_js_1.logger.error(`[WebSearch] Exa API error: ${JSON.stringify(err.response.data)}`);
            }
            return { success: false, error: err.message || "Unknown error" };
        }
    }
}
exports.WebSearchService = WebSearchService;

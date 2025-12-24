//--------------------------------------------------------------
// FILE: src/services/webSearchService.ts
// Web Search Service using Exa API
//--------------------------------------------------------------

import axios from "axios";
import { logger } from "../utils/logger.js";

type SearchCategory =
  | "company"
  | "research paper"
  | "news"
  | "pdf"
  | "github"
  | "tweet"
  | "personal site"
  | "linkedin profile"
  | "financial report";

type WebSearchArgs = {
  query: string;
  num_results?: number;
  category?: SearchCategory;
  include_text?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
  start_published_date?: string;
  end_published_date?: string;
  user_location?: string;
};

type SearchResult = {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  summary?: string;
  highlights?: string[];
  text?: string;
};

export class WebSearchService {
  private apiKey: string;
  private baseUrl = "https://api.exa.ai/search";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(args: WebSearchArgs): Promise<{ success: boolean; results?: SearchResult[]; error?: string }> {
    try {
      logger.info(`🔍 [WebSearch] Searching for: "${args.query.substring(0, 100)}"`);

      const requestBody: any = {
        query: args.query,
        numResults: args.num_results || 5, // Reduced from 10 to 3 to avoid context overflow
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

      const response = await axios.post(this.baseUrl, requestBody, {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        timeout: 30000,
      });

      if (!response.data || !response.data.results) {
        logger.warn("[WebSearch] No results returned from Exa API");
        return { success: true, results: [] };
      }

      const results: SearchResult[] = response.data.results.map((r: any) => ({
        title: r.title || "Untitled",
        url: r.url,
        publishedDate: r.publishedDate,
        author: r.author,
        score: r.score,
        summary: r.summary,
        highlights: r.highlights || [],
        text: r.text,
      }));

      logger.info(`✅ [WebSearch] Found ${results.length} results`);
      return { success: true, results };
    } catch (err: any) {
      logger.error(`❌ [WebSearch] Search failed: ${err.message}`);
      if (err.response) {
        logger.error(`[WebSearch] Exa API error: ${JSON.stringify(err.response.data)}`);
      }
      return { success: false, error: err.message || "Unknown error" };
    }
  }
}

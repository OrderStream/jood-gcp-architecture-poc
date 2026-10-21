import { createHash } from 'crypto';

/**
 * Normalized data structure for commercial office furniture clearance lots
 */
export interface NormalizedLot {
  sourceId: string;
  externalId: string;
  title: string;
  category: string;
  currentPrice: number;
  discountPct: number;
  clearanceTier: 'Tier A' | 'Tier B' | 'Overstock' | 'Liquidation';
  contentHash: string;
  rawPayload: Record<string, unknown>;
}

/**
 * Abstract Base Connector for all public international clearance platforms.
 * New sources simply implement fetch() and parse() without modifying ingestion logic.
 */
export abstract class BaseConnector<TRawRecord> {
  abstract readonly sourceId: string;

  /**
   * Fetches raw records from external source (HTTP API or Puppeteer scraper)
   */
  abstract fetch(): Promise<TRawRecord[]>;

  /**
   * Normalizes source-specific record into standardized lot schema
   */
  abstract parse(raw: TRawRecord): Omit<NormalizedLot, 'sourceId' | 'contentHash'>;

  /**
   * Deterministic SHA-256 content hashing to ensure idempotent database writes
   */
  protected computeHash(data: unknown): string {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  /**
   * Orchestrates fetch, normalize, and hash generation
   */
  public async execute(): Promise<NormalizedLot[]> {
    const rawRecords = await this.fetch();
    return rawRecords.map((raw) => {
      const normalized = this.parse(raw);
      return {
        ...normalized,
        sourceId: this.sourceId,
        contentHash: this.computeHash(raw),
      };
    });
  }
}

/**
 * Example implementation for an international clearance platform parser
 */
export interface SampleRawClearanceItem {
  item_sku: string;
  item_name: string;
  list_price_usd: number;
  sale_price_usd: number;
  condition_grade: string;
  attributes: Record<string, unknown>;
}

export class ExampleInternationalClearanceConnector extends BaseConnector<SampleRawClearanceItem> {
  readonly sourceId = 'intl_clearance_source_alpha';

  async fetch(): Promise<SampleRawClearanceItem[]> {
    // In production, this executes the hardened Puppeteer or HTTP API call
    return [];
  }

  parse(raw: SampleRawClearanceItem): Omit<NormalizedLot, 'sourceId' | 'contentHash'> {
    const discountPct = raw.list_price_usd > 0
      ? Math.round(((raw.list_price_usd - raw.sale_price_usd) / raw.list_price_usd) * 100)
      : 0;

    return {
      externalId: raw.item_sku,
      title: raw.item_name,
      category: 'Office Workstations & Desking',
      currentPrice: raw.sale_price_usd,
      discountPct,
      clearanceTier: raw.condition_grade === 'Like New' ? 'Tier A' : 'Overstock',
      rawPayload: raw as unknown as Record<string, unknown>,
    };
  }
}

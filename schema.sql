-- ==============================================================================
-- Jood Core Inventory & Historical Price Tracking Schema (PostgreSQL / Cloud SQL)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core lots table with content-hash deduplication
CREATE TABLE IF NOT EXISTS furniture_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id VARCHAR(64) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    category VARCHAR(100),
    current_price NUMERIC(12, 2) NOT NULL,
    discount_pct NUMERIC(5, 2) DEFAULT 0.00,
    clearance_tier VARCHAR(50),
    content_hash CHAR(64) NOT NULL, -- SHA-256 of raw payload to prevent duplicate writes
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_source_external UNIQUE (source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_furniture_lots_source ON furniture_lots(source_id);
CREATE INDEX IF NOT EXISTS idx_furniture_lots_category ON furniture_lots(category);
CREATE INDEX IF NOT EXISTS idx_furniture_lots_tier ON furniture_lots(clearance_tier);
CREATE INDEX IF NOT EXISTS idx_furniture_lots_hash ON furniture_lots(content_hash);

-- Append-only historical price log for trend analysis and margin tracking
CREATE TABLE IF NOT EXISTS furniture_price_history (
    id BIGSERIAL PRIMARY KEY,
    lot_id UUID REFERENCES furniture_lots(id) ON DELETE CASCADE,
    price NUMERIC(12, 2) NOT NULL,
    discount_pct NUMERIC(5, 2),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_lot ON furniture_price_history(lot_id);
CREATE INDEX IF NOT EXISTS idx_price_history_time ON furniture_price_history(recorded_at);

-- Idempotent upsert procedure:
-- 1. Inserts new record and initializes price history
-- 2. If record exists and content_hash changed -> updates lot and logs new price entry
-- 3. If record exists and content_hash matches -> NO-OP (zero redundant writes)
CREATE OR REPLACE FUNCTION upsert_furniture_lot(
    p_source_id VARCHAR,
    p_external_id VARCHAR,
    p_title VARCHAR,
    p_category VARCHAR,
    p_price NUMERIC,
    p_discount_pct NUMERIC,
    p_clearance_tier VARCHAR,
    p_content_hash CHAR(64),
    p_raw_payload JSONB
) RETURNS VOID AS $$
DECLARE
    v_lot_id UUID;
    v_existing_hash CHAR(64);
BEGIN
    SELECT id, content_hash INTO v_lot_id, v_existing_hash
    FROM furniture_lots
    WHERE source_id = p_source_id AND external_id = p_external_id;

    IF v_lot_id IS NULL THEN
        INSERT INTO furniture_lots (
            source_id, external_id, title, category, current_price, discount_pct, clearance_tier, content_hash, raw_payload
        ) VALUES (
            p_source_id, p_external_id, p_title, p_category, p_price, p_discount_pct, p_clearance_tier, p_content_hash, p_raw_payload
        ) RETURNING id INTO v_lot_id;

        INSERT INTO furniture_price_history (lot_id, price, discount_pct)
        VALUES (v_lot_id, p_price, p_discount_pct);
    ELSIF v_existing_hash <> p_content_hash THEN
        UPDATE furniture_lots SET
            title = p_title,
            category = p_category,
            current_price = p_price,
            discount_pct = p_discount_pct,
            clearance_tier = p_clearance_tier,
            content_hash = p_content_hash,
            raw_payload = p_raw_payload,
            updated_at = NOW()
        WHERE id = v_lot_id;

        INSERT INTO furniture_price_history (lot_id, price, discount_pct)
        VALUES (v_lot_id, p_price, p_discount_pct);
    END IF;
END;
$$ LANGUAGE plpgsql;

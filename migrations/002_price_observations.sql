CREATE TABLE IF NOT EXISTS tool_price_observations (
 id text PRIMARY KEY,
 tool_id text NOT NULL REFERENCES tools ON DELETE CASCADE,
 source_id text NOT NULL REFERENCES registry_sources,
 currency text NOT NULL,
 amount numeric NOT NULL CHECK(amount>=0),
 context text NOT NULL,
 usable_for_estimate boolean NOT NULL DEFAULT false CHECK(usable_for_estimate=false)
);
CREATE INDEX IF NOT EXISTS observations_tool ON tool_price_observations(tool_id);

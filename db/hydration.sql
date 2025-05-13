CREATE TABLE IF NOT EXISTS hydration_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id INT NOT NULL,
    asset_id VARCHAR(50),
    symbol VARCHAR(50),
    farm_apr DOUBLE,
    pool_apr DOUBLE,
    total_apr DOUBLE,
    tvl_usd DOUBLE,
    volume_usd DOUBLE,
    timestamp VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

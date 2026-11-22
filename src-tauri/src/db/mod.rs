mod migrations;
mod seed;

use rusqlite::Connection;

use crate::{e, secrets::migrate_secret_settings, Res};
pub use migrations::migrate_legacy_data_dir;

pub fn initialize_db(conn: &Connection) -> Res<()> {
    conn.execute_batch(migrations::SCHEMA).map_err(e)?;
    migrate_secret_settings(conn)?;
    migrations::run_column_migrations(conn)?;
    seed::seed_default_sources(conn)?;
    seed::seed_default_layer_groups(conn)?;
    Ok(())
}

mod local;
mod path;
mod remote;

pub use local::read_tile;
pub use remote::{invalidate_tile_cache_setting, read_remote_tile};

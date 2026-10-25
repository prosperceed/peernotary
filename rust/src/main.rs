use tokio::net::TcpListener;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use tlsn_service::{api::build_router, config::AppConfig, state::AppState};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let config = match AppConfig::from_env() {
        Ok(cfg) => cfg,
        Err(err) => {
            error!(error = %err, "Failed to validate startup configuration");
            std::process::exit(1);
        }
    };

    let bind_addr = config.bind_addr;
    let state = AppState::new(config);
    let app = build_router(state);

    let listener = match TcpListener::bind(bind_addr).await {
        Ok(l) => l,
        Err(err) => {
            error!(error = %err, addr = %bind_addr, "Failed to bind TCP listener");
            std::process::exit(1);
        }
    };

    info!(addr = %bind_addr, "PeerNotary TLSNotary cryptographic verification service started");

    if let Err(err) = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
    {
        error!(error = %err, "Server exited with error");
        std::process::exit(1);
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sig) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            sig.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("Graceful shutdown signal received");
}

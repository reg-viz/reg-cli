//! Custom tracing layer for collecting span data to be sent to JS side
//!
//! Since WASI doesn't support direct HTTP connections, we collect trace data
//! and pass it to the JS side via WASM exports, where it's converted to OpenTelemetry spans.

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::span::{Attributes, Id, Record};
use tracing::{Event, Subscriber};
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::Layer;

/// Global counter for generating unique span IDs
static SPAN_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Represents a completed span with all its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanData {
    /// Unique identifier for this span
    pub span_id: String,
    /// Parent span id if any
    pub parent_span_id: Option<String>,
    /// Name of the span (usually the function/operation name)
    pub name: String,
    /// Start timestamp in milliseconds since UNIX epoch
    pub start_time_ms: u64,
    /// End timestamp in milliseconds since UNIX epoch
    pub end_time_ms: u64,
    /// Duration in milliseconds
    pub duration_ms: u64,
    /// Span level (trace, debug, info, warn, error)
    pub level: String,
    /// Target module path
    pub target: String,
    /// Custom attributes
    pub attributes: HashMap<String, String>,
    /// Status: "ok" or "error"
    pub status: String,
    /// Error message if status is "error"
    pub error_message: Option<String>,
}

/// Container for all collected spans
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct TraceData {
    /// Service name
    pub service_name: String,
    /// Trace ID from JS side (for context propagation)
    pub trace_id: Option<String>,
    /// Parent span ID from JS side (for context propagation)
    pub js_parent_span_id: Option<String>,
    /// All completed spans
    pub spans: Vec<SpanData>,
}

/// Global storage for trace data
static TRACE_COLLECTOR: Lazy<Mutex<TraceCollector>> =
    Lazy::new(|| Mutex::new(TraceCollector::new()));

struct TraceCollector {
    spans: Vec<SpanData>,
    /// Maps tracing crate's span ID to our unique span ID
    id_mapping: HashMap<u64, u64>,
    active_spans: HashMap<u64, ActiveSpan>,
    /// Trace ID from JS side
    trace_id: Option<String>,
    /// Parent span ID from JS side
    js_parent_span_id: Option<String>,
}

struct ActiveSpan {
    unique_id: u64,
    name: String,
    start_time_ms: u64,
    parent_unique_id: Option<u64>,
    level: String,
    target: String,
    attributes: HashMap<String, String>,
}

impl TraceCollector {
    fn new() -> Self {
        Self {
            spans: Vec::new(),
            id_mapping: HashMap::new(),
            active_spans: HashMap::new(),
            trace_id: None,
            js_parent_span_id: None,
        }
    }

    fn current_time_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_millis() as u64
    }

    fn generate_unique_id() -> u64 {
        SPAN_ID_COUNTER.fetch_add(1, Ordering::SeqCst)
    }

    fn set_js_context(&mut self, trace_id: Option<String>, parent_span_id: Option<String>) {
        self.trace_id = trace_id;
        self.js_parent_span_id = parent_span_id;
    }

    fn start_span(&mut self, tracing_id: u64, parent_tracing_id: Option<u64>, name: String, level: String, target: String) {
        let start_time_ms = Self::current_time_ms();
        let unique_id = Self::generate_unique_id();
        
        // Map tracing's ID to our unique ID
        self.id_mapping.insert(tracing_id, unique_id);
        
        // Look up parent's unique ID
        let parent_unique_id = parent_tracing_id.and_then(|pid| self.id_mapping.get(&pid).copied());
        
        self.active_spans.insert(
            tracing_id,
            ActiveSpan {
                unique_id,
                name,
                start_time_ms,
                parent_unique_id,
                level,
                target,
                attributes: HashMap::new(),
            },
        );
    }

    fn record_attribute(&mut self, tracing_id: u64, key: String, value: String) {
        if let Some(span) = self.active_spans.get_mut(&tracing_id) {
            span.attributes.insert(key, value);
        }
    }

    fn end_span(&mut self, tracing_id: u64, error_message: Option<String>) {
        if let Some(active) = self.active_spans.remove(&tracing_id) {
            let end_time_ms = Self::current_time_ms();
            // Calculate duration from timestamps (more reliable in WASI)
            let duration_ms = end_time_ms.saturating_sub(active.start_time_ms);
            
            self.spans.push(SpanData {
                span_id: format!("{:016x}", active.unique_id),
                parent_span_id: active.parent_unique_id.map(|pid| format!("{:016x}", pid)),
                name: active.name,
                start_time_ms: active.start_time_ms,
                end_time_ms,
                duration_ms,
                level: active.level,
                target: active.target,
                attributes: active.attributes,
                status: if error_message.is_some() {
                    "error".to_string()
                } else {
                    "ok".to_string()
                },
                error_message,
            });
        }
        
        // Note: We keep id_mapping entries for now in case of late references
    }
}

/// Custom tracing layer that collects span data
pub struct CollectorLayer;

impl CollectorLayer {
    pub fn new() -> Self {
        Self
    }
}

impl<S> Layer<S> for CollectorLayer
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_new_span(&self, attrs: &Attributes<'_>, id: &Id, ctx: Context<'_, S>) {
        let span = ctx.span(id).expect("Span not found");
        
        // Try to get parent from explicit parent first, then from current context
        let parent_id = span
            .parent()
            .map(|p| p.id().into_u64())
            .or_else(|| {
                // If no explicit parent, check current span context (for implicit parenting)
                ctx.current_span().id().map(|id| id.into_u64())
            });
        
        let metadata = span.metadata();
        let name = metadata.name().to_string();
        let level = format!("{:?}", metadata.level());
        let target = metadata.target().to_string();
        
        if let Ok(mut collector) = TRACE_COLLECTOR.lock() {
            collector.start_span(id.into_u64(), parent_id, name, level, target);
        }
        
        // Record initial attributes
        let mut visitor = AttributeVisitor { id: id.into_u64() };
        attrs.record(&mut visitor);
    }

    fn on_record(&self, id: &Id, values: &Record<'_>, _ctx: Context<'_, S>) {
        let mut visitor = AttributeVisitor { id: id.into_u64() };
        values.record(&mut visitor);
    }

    fn on_event(&self, event: &Event<'_>, ctx: Context<'_, S>) {
        // Record events as attributes on the current span
        if let Some(span) = ctx.current_span().id() {
            let mut visitor = AttributeVisitor {
                id: span.into_u64(),
            };
            event.record(&mut visitor);
        }
    }

    fn on_close(&self, id: Id, _ctx: Context<'_, S>) {
        if let Ok(mut collector) = TRACE_COLLECTOR.lock() {
            collector.end_span(id.into_u64(), None);
        }
    }
}

struct AttributeVisitor {
    id: u64,
}

impl tracing::field::Visit for AttributeVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if let Ok(mut collector) = TRACE_COLLECTOR.lock() {
            collector.record_attribute(self.id, field.name().to_string(), format!("{:?}", value));
        }
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if let Ok(mut collector) = TRACE_COLLECTOR.lock() {
            collector.record_attribute(self.id, field.name().to_string(), value.to_string());
        }
    }

    fn record_i64(&mut self, field: &tracing::field::Field, value: i64) {
        if let Ok(mut collector) = TRACE_COLLECTOR.lock() {
            collector.record_attribute(self.id, field.name().to_string(), value.to_string());
        }
    }

    fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
        if let Ok(mut collector) = TRACE_COLLECTOR.lock() {
            collector.record_attribute(self.id, field.name().to_string(), value.to_string());
        }
    }

    fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
        if let Ok(mut collector) = TRACE_COLLECTOR.lock() {
            collector.record_attribute(self.id, field.name().to_string(), value.to_string());
        }
    }
}

/// Initialize tracing with the collector layer
pub fn init_tracing() {
    use tracing_subscriber::prelude::*;
    
    let collector_layer = CollectorLayer::new();
    
    tracing_subscriber::registry()
        .with(collector_layer)
        .init();
}

/// Set JS context for trace propagation
/// This should be called before starting any spans to link Rust spans to JS parent
pub fn set_js_trace_context(trace_id: Option<&str>, parent_span_id: Option<&str>) {
    if let Ok(mut collector) = TRACE_COLLECTOR.lock() {
        collector.set_js_context(
            trace_id.map(|s| s.to_string()),
            parent_span_id.map(|s| s.to_string()),
        );
    }
}

/// Get all collected trace data as JSON string
pub fn get_trace_data_json() -> String {
    let (spans, trace_id, js_parent_span_id) = if let Ok(collector) = TRACE_COLLECTOR.lock() {
        (
            collector.spans.clone(),
            collector.trace_id.clone(),
            collector.js_parent_span_id.clone(),
        )
    } else {
        (Vec::new(), None, None)
    };
    
    let trace_data = TraceData {
        service_name: "reg-cli-wasm".to_string(),
        trace_id,
        js_parent_span_id,
        spans,
    };
    
    serde_json::to_string(&trace_data).unwrap_or_else(|_| "{}".to_string())
}

/// Clear all collected trace data
pub fn clear_trace_data() {
    if let Ok(mut collector) = TRACE_COLLECTOR.lock() {
        collector.spans.clear();
        collector.active_spans.clear();
        collector.id_mapping.clear();
        collector.trace_id = None;
        collector.js_parent_span_id = None;
    }
}


use cold_clear::{evaluation::Standard, Interface, Options};
use futures::{channel::mpsc::unbounded, StreamExt};
use libtetris::{Board, Piece, RotationState, TspinStatus};
use serde_json::{json, Value};
use wasm_bindgen::{prelude::*, JsCast};
use wasm_bindgen_futures::spawn_local;
use web_sys::{DedicatedWorkerGlobalScope, MessageEvent};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = self)]
    static GLOBAL: DedicatedWorkerGlobalScope;
}

#[wasm_bindgen]
pub fn start() {
    let (message_send, mut messages) = unbounded::<String>();

    let callback = Closure::wrap(Box::new(move |event: MessageEvent| {
        if let Some(message) = event.data().as_string() {
            let _ = message_send.unbounded_send(message);
        }
    }) as Box<dyn FnMut(MessageEvent)>);

    GLOBAL
        .add_event_listener_with_callback("message", callback.as_ref().unchecked_ref())
        .expect("Failed to listen for Cold Clear messages");
    callback.forget();

    let scope = GLOBAL.clone();
    spawn_local(async move {
        let mut engine: Option<Interface> = None;

        while let Some(raw) = messages.next().await {
            let message: Value = match serde_json::from_str(&raw) {
                Ok(value) => value,
                Err(error) => {
                    post(&scope, json!({ "type": "error", "message": format!("Invalid message: {error}") }));
                    continue;
                }
            };

            match message["type"].as_str().unwrap_or_default() {
                "start" => {
                    let result = build_engine(&message).await;
                    match result {
                        Ok(new_engine) => {
                            engine = Some(new_engine);
                            post(&scope, json!({ "type": "ready" }));
                        }
                        Err(error) => {
                            engine = None;
                            post(&scope, json!({ "type": "error", "message": error }));
                        }
                    }
                }
                "suggest" => {
                    if let Some(bot) = engine.as_mut() {
                        bot.request_next_move(0);
                        match bot.next_move().await {
                            Some((movement, _info)) => {
                                let location = movement.expected_location;
                                post(
                                    &scope,
                                    json!({
                                        "type": "suggestion",
                                        "hold": movement.hold,
                                        "piece": piece_name(location.kind.0),
                                        "orientation": rotation_name(location.kind.1),
                                        "x": location.x,
                                        "y": location.y,
                                        "spin": spin_name(location.tspin)
                                    }),
                                );
                            }
                            None => {
                                post(&scope, json!({ "type": "dead" }));
                            }
                        }
                    } else {
                        post(&scope, json!({
                            "type": "error",
                            "message": "Cold Clear was asked for a move before it was initialized."
                        }));
                    }
                }
                "new_piece" => {
                    if let (Some(bot), Some(piece)) =
                        (engine.as_ref(), message["piece"].as_str().and_then(parse_piece))
                    {
                        bot.add_next_piece(piece);
                    }
                }
                "reset" => {
                    if let Some(bot) = engine.as_ref() {
                        match parse_field(&message["board"]) {
                            Some(field) => bot.reset(
                                field,
                                message["back_to_back"].as_bool().unwrap_or(false),
                                message["combo"].as_u64().unwrap_or(0) as u32,
                            ),
                            None => post(&scope, json!({
                                "type": "error",
                                "message": "Cold Clear received an invalid board reset."
                            })),
                        }
                    }
                }
                "stop" => {
                    engine = None;
                    post(&scope, json!({ "type": "stopped" }));
                }
                "quit" => break,
                _ => post(&scope, json!({
                    "type": "error",
                    "message": "Cold Clear received an unknown command."
                })),
            }
        }
    });
}

async fn build_engine(message: &Value) -> Result<Interface, String> {
    let mut board = Board::new();
    let field = parse_field(&message["board"])
        .ok_or_else(|| "The game supplied an invalid 40-row board.".to_string())?;
    board.set_field(field);

    board.combo = message["combo"].as_u64().unwrap_or(0) as u32;
    board.b2b_bonus = message["back_to_back"].as_bool().unwrap_or(false);
    board.hold_piece = message["hold"].as_str().and_then(parse_piece);

    let queue = message["queue"]
        .as_array()
        .ok_or_else(|| "The game did not provide a piece queue.".to_string())?;
    for item in queue {
        let piece = item
            .as_str()
            .and_then(parse_piece)
            .ok_or_else(|| "The game supplied an unknown piece in its queue.".to_string())?;
        board.add_next_piece(piece);
    }

    let max_nodes = message["max_nodes"]
        .as_u64()
        .unwrap_or(750_000)
        .clamp(50_000, 4_000_000_000) as u32;

    let options = Options {
        use_hold: true,
        speculate: true,
        max_nodes,
        min_nodes: 0,
        threads: 1,
        ..Options::default()
    };

    Ok(Interface::launch(
        "worker.js",
        board,
        options,
        Standard::default(),
    )
    .await)
}

fn parse_field(value: &Value) -> Option<[[bool; 10]; 40]> {
    let rows = value.as_array()?;
    if rows.len() != 40 {
        return None;
    }

    let mut field = [[false; 10]; 40];
    for (y, row) in rows.iter().enumerate() {
        let cells = row.as_array()?;
        if cells.len() != 10 {
            return None;
        }
        for (x, cell) in cells.iter().enumerate() {
            field[y][x] = cell.as_bool()?;
        }
    }
    Some(field)
}

fn parse_piece(value: &str) -> Option<Piece> {
    match value {
        "I" => Some(Piece::I),
        "O" => Some(Piece::O),
        "T" => Some(Piece::T),
        "L" => Some(Piece::L),
        "J" => Some(Piece::J),
        "S" => Some(Piece::S),
        "Z" => Some(Piece::Z),
        _ => None,
    }
}

fn piece_name(piece: Piece) -> &'static str {
    match piece {
        Piece::I => "I",
        Piece::O => "O",
        Piece::T => "T",
        Piece::L => "L",
        Piece::J => "J",
        Piece::S => "S",
        Piece::Z => "Z",
    }
}

fn rotation_name(rotation: RotationState) -> &'static str {
    match rotation {
        RotationState::North => "north",
        RotationState::East => "east",
        RotationState::South => "south",
        RotationState::West => "west",
    }
}

fn spin_name(spin: TspinStatus) -> &'static str {
    match spin {
        TspinStatus::None => "none",
        TspinStatus::Mini => "mini",
        TspinStatus::Full => "full",
    }
}

fn post(scope: &DedicatedWorkerGlobalScope, message: Value) {
    let _ = scope.post_message(&JsValue::from_str(&message.to_string()));
}

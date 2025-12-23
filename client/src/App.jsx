import { useEffect, useState } from "react";
import axios from "axios";
import io from "socket.io-client";

const socket = io("http://localhost:3000");

export default function App() {
  const [showId, setShowId] = useState("");
  const [seat, setSeat] = useState("A1");
  const [name, setName] = useState("");
  const [seats, setSeats] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState("");

  /* 🔁 WebSocket: real-time updates */
  useEffect(() => {
    socket.on("seat-update", () => {
      if (showId) {
        fetchSeats(showId);
      }
    });

    return () => socket.off("seat-update");
  }, [showId]);

  /* 🔄 Auto fetch seats when showId changes */
  useEffect(() => {
    if (showId) {
      fetchSeats(showId);
    }
  }, [showId]);

  /* 🎯 Update snapshot when seats / selected seat changes */
  useEffect(() => {
    const current = seats.find((s) => s.seat_id === seat);
    setSnapshot(current || null);
  }, [seats, seat]);

  /* 1️⃣ Seed seats */
  const seedSeats = async () => {
    const res = await axios.post("http://localhost:3000/seed");
    setShowId(res.data.showId);
    setStatus("Show seeded successfully");
  };

  /* 2️⃣ Fetch seats */
  const fetchSeats = async (id) => {
    const res = await axios.get(`http://localhost:3000/seats/${id}`);
    setSeats(res.data);
  };

  /* 3️⃣ Hold seat */
  const checkoutSeat = async () => {
    try {
      await axios.post("http://localhost:3000/hold", {
        showId,
        seatId: seat,
        user: name,
      });
      setStatus(`Seat ${seat} HELD by ${name}`);
    } catch {
      setStatus("Seat already held by another user");
    }
  };

  /* 4️⃣ Confirm payment */
  const confirmPayment = async () => {
    await axios.post("http://localhost:3000/confirm", {
      showId,
      seatId: seat,
      user: name,
    });
    setStatus(`Seat ${seat} BOOKED`);
  };

  return (
    <div className="app-container">
      <h1 className="app-title">🎬 Book My Show</h1>

      {/* Controls */}
      <div className="form-row">
        <button
          className="btn-primary"
          onClick={seedSeats}
          disabled={showId !== ""}
        >
          Seed Show + 30 Seats
        </button>

        <button
          className="btn-primary"
          onClick={() => fetchSeats(showId)}
          disabled={!showId}
        >
          Refresh Seats
        </button>
      </div>

      {/* Show ID */}
      <div className="form-row">
        <div style={{ width: "100%" }}>
          <label>Show ID</label>
          <input
            type="text"
            value={showId}
            onChange={(e) => setShowId(e.target.value)}
            placeholder="Paste Show ID here"
          />
        </div>
      </div>

      {/* Seat & Name */}
      <div className="form-row">
        <div>
          <label>Seat</label>
          <select value={seat} onChange={(e) => setSeat(e.target.value)}>
            {Array.from({ length: 30 }).map((_, i) => (
              <option key={i} value={`A${i + 1}`}>
                A{i + 1}
              </option>
            ))}
          </select>
        </div>

        <div style={{ width: "100%" }}>
          <label>Name</label>
          <input
            placeholder="eg: Cheekuta"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="form-row">
        <button
          className="btn-primary"
          onClick={checkoutSeat}
          disabled={!name || snapshot?.status !== "AVAILABLE"}
        >
          Checkout (Hold Seat)
        </button>

        <button
          className="btn-success"
          onClick={confirmPayment}
          disabled={snapshot?.status !== "HELD"}
        >
          Confirm Payment
        </button>
      </div>

      {/* Status */}
      <p className="status-text">
        Status: <span>{status || "-"}</span>
      </p>

      {/* Seat Snapshot */}
      <h3>Seat Snapshot</h3>
      <div className="snapshot">
        <pre>
          {snapshot
            ? JSON.stringify(snapshot, null, 2)
            : "No seat data yet"}
        </pre>
      </div>

      {/* All Seats */}
      <h3>All Seats</h3>
      <div className="seat-grid">
        {seats.map((s) => (
          <div
            key={s.seat_id}
            className={`seat ${
              s.status === "AVAILABLE"
                ? "available"
                : s.status === "HELD"
                ? "held"
                : "booked"
            }`}
          >
            {s.seat_id}
            <div style={{ fontSize: 12 }}>{s.status}</div>
            {s.booked_by && (
              <div style={{ fontSize: 11 }}>by {s.booked_by}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

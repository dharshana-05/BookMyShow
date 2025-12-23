const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const redis = require("redis");
const mysql = require("mysql2/promise");
const { v4: uuid } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

async function startServer() {
  /* Redis */
  const redisClient = redis.createClient();
  const redisSub = redisClient.duplicate();
  await redisClient.connect();
  await redisSub.connect();
  await redisClient.configSet("notify-keyspace-events", "Ex");

  /* MySQL */
  const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "12345",
    database: "bookmyshow",
  });

  /* TTL expiry → release seat */
  await redisSub.subscribe("__keyevent@0__:expired", async (key) => {
    if (key.startsWith("seat:")) {
      const [, showId, seatId] = key.split(":");

      await db.query(
        `UPDATE seats
         SET status='AVAILABLE', booked_by=NULL, booked_at=NULL
         WHERE show_id=? AND seat_id=?`,
        [showId, seatId]
      );

      io.emit("seat-update");
    }
  });

  app.get("/", (_, res) => res.send("Backend Running"));

  /* Seed */
  app.post("/seed", async (_, res) => {
    const showId = uuid();
    await db.query("INSERT INTO shows VALUES (?)", [showId]);

    const seats = Array.from({ length: 30 }, (_, i) => [
      `A${i + 1}`,
      showId,
      "AVAILABLE",
      null,
      null,
    ]);

    await db.query(
      `INSERT INTO seats
       (seat_id, show_id, status, booked_by, booked_at)
       VALUES ?`,
      [seats]
    );

    io.emit("seat-update");
    res.json({ showId });
  });

  /* Get seats */
  app.get("/seats/:showId", async (req, res) => {
    const [rows] = await db.query(
      "SELECT * FROM seats WHERE show_id=?",
      [req.params.showId]
    );
    res.json(rows);
  });

  /* Hold */
  app.post("/hold", async (req, res) => {
    const { showId, seatId, user } = req.body;
    const key = `seat:${showId}:${seatId}`;

    if (await redisClient.get(key)) {
      return res.status(409).send("Seat already held");
    }

    await redisClient.set(key, user, { EX: 30 });

    await db.query(
      `UPDATE seats
       SET status='HELD', booked_by=?, booked_at=NOW()
       WHERE show_id=? AND seat_id=?`,
      [user, showId, seatId]
    );

    await db.query(
      `INSERT INTO bookings VALUES (?,?,?,?,?,NOW())`,
      [uuid(), showId, seatId, user, "HELD"]
    );

    io.emit("seat-update");
    res.send("Seat held");
  });

  /* Confirm */
  app.post("/confirm", async (req, res) => {
    const { showId, seatId, user } = req.body;

    await redisClient.del(`seat:${showId}:${seatId}`);

    await db.query(
      `UPDATE seats
       SET status='BOOKED'
       WHERE show_id=? AND seat_id=?`,
      [showId, seatId]
    );

    await db.query(
      `UPDATE bookings
       SET status='BOOKED'
       WHERE show_id=? AND seat_id=? AND user_name=?`,
      [showId, seatId, user]
    );

    io.emit("seat-update");
    res.send("Seat booked");
  });

  server.listen(3000, () =>
    console.log("Backend running on http://localhost:3000")
  );
}

startServer();

CREATE TABLE flight_rooms (
 code TEXT PRIMARY KEY NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 write_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 state TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX flight_room_expiry ON flight_rooms(expires_at);
--> statement-breakpoint
CREATE TABLE pilot_profiles (
 id TEXT PRIMARY KEY NOT NULL,
 recovery_hash TEXT UNIQUE NOT NULL,
 name TEXT NOT NULL,
 ship TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 room_code TEXT,
 lease TEXT
);
--> statement-breakpoint
CREATE INDEX pilot_active_room ON pilot_profiles(room_code);
--> statement-breakpoint
CREATE TRIGGER save_active_pilots AFTER UPDATE OF state ON flight_rooms
BEGIN
 UPDATE pilot_profiles
 SET ship = member.saved_ship, revision = revision + 1
 FROM (
  SELECT json_extract(value, '$.id') AS pilot,
         json_extract(value, '$.lease') AS membership,
         json_extract(value, '$.ship') AS saved_ship
  FROM json_each(NEW.state, '$.players')
 ) AS member
 WHERE room_code = NEW.code AND id = member.pilot AND lease = member.membership AND ship IS NOT member.saved_ship;
END;

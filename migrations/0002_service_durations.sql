-- Mantiene invariata la data e l'ora di inizio degli appuntamenti futuri
-- confermati e aggiorna soltanto la loro durata.
UPDATE bookings
SET end_at = CASE service_id
  WHEN 'haircut' THEN strftime('%Y-%m-%dT%H:%M:%fZ', start_at, '+35 minutes')
  WHEN 'beard' THEN strftime('%Y-%m-%dT%H:%M:%fZ', start_at, '+10 minutes')
  WHEN 'combo' THEN strftime('%Y-%m-%dT%H:%M:%fZ', start_at, '+45 minutes')
  ELSE end_at
END
WHERE status = 'confirmed'
  AND start_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

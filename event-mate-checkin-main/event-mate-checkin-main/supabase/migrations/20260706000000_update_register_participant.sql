-- Redefine register_participant function to handle deduplication (same email + name = update, same email + diff name = new) and strict room capacity checks.

CREATE OR REPLACE FUNCTION public.register_participant(
  _event_id UUID,
  _first_name TEXT,
  _last_name TEXT,
  _email TEXT,
  _phone TEXT,
  _room_ids UUID[]
)
RETURNS TABLE(registration_id UUID, qr_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid UUID;
  qrc TEXT;
  rm RECORD;
  current_count INTEGER;
  normalized_email TEXT;
  normalized_first_name TEXT;
  normalized_last_name TEXT;
BEGIN
  normalized_email := lower(trim(_email));
  normalized_first_name := trim(_first_name);
  normalized_last_name := trim(_last_name);

  -- Check if a registration with the same email AND name already exists for this event
  SELECT id, public.registrations.qr_code INTO rid, qrc
  FROM public.registrations
  WHERE event_id = _event_id
    AND lower(trim(first_name)) = lower(normalized_first_name)
    AND lower(trim(last_name)) = lower(normalized_last_name)
    AND lower(trim(email)) = normalized_email
  LIMIT 1;

  -- Validate capacity for each requested room
  IF _room_ids IS NOT NULL THEN
    FOR rm IN
      SELECT r.id, r.name, r.capacity
      FROM public.rooms r
      WHERE r.id = ANY(_room_ids) AND r.event_id = _event_id
    LOOP
      IF rm.capacity IS NOT NULL THEN
        -- Count other participants in this room, excluding the current participant if we are updating their registration
        SELECT count(*) INTO current_count
        FROM public.registration_rooms rr
        WHERE rr.room_id = rm.id 
          AND rr.registration_id != COALESCE(rid, '00000000-0000-0000-0000-000000000000'::uuid);
          
        IF current_count >= rm.capacity THEN
          RAISE EXCEPTION 'Plus de place pour la salle %', rm.name USING ERRCODE='P0001';
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF rid IS NOT NULL THEN
    -- UPDATE existing registration
    UPDATE public.registrations
    SET phone = _phone
    WHERE id = rid;

    -- Update rooms: delete old rooms and insert new ones
    DELETE FROM public.registration_rooms WHERE registration_id = rid;
    
    IF _room_ids IS NOT NULL THEN
      INSERT INTO public.registration_rooms(registration_id, room_id)
      SELECT rid, unnest(_room_ids)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    -- INSERT new registration
    INSERT INTO public.registrations(event_id, first_name, last_name, email, phone)
    VALUES (_event_id, _first_name, _last_name, _email, _phone)
    RETURNING id, public.registrations.qr_code INTO rid, qrc;

    -- Link rooms
    IF _room_ids IS NOT NULL THEN
      INSERT INTO public.registration_rooms(registration_id, room_id)
      SELECT rid, unnest(_room_ids)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY SELECT rid, qrc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_participant(UUID,TEXT,TEXT,TEXT,TEXT,UUID[]) TO anon, authenticated;

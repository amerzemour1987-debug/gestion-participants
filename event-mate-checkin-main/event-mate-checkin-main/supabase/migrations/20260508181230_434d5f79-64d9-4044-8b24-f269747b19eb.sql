
-- ============= EVENTS =============
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Mon événement',
  subtitle TEXT DEFAULT '',
  description TEXT DEFAULT '',
  event_date DATE,
  time_range TEXT DEFAULT '',
  location TEXT DEFAULT '',
  banner_url TEXT,
  logo_url TEXT,
  slug TEXT NOT NULL UNIQUE DEFAULT lower(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active events" ON public.events
FOR SELECT USING (is_active = true OR has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage events insert" ON public.events
FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage events update" ON public.events
FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage events delete" ON public.events
FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- ============= ROOMS =============
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER, -- NULL = illimité
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rooms" ON public.rooms
FOR SELECT USING (true);
CREATE POLICY "Admins insert rooms" ON public.rooms
FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update rooms" ON public.rooms
FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete rooms" ON public.rooms
FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- ============= REGISTRATIONS =============
CREATE TABLE public.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  qr_code TEXT NOT NULL UNIQUE DEFAULT ('EVT-'|| substr(gen_random_uuid()::text,1,12)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can register" ON public.registrations
FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff view registrations" ON public.registrations
FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hostess')
);
CREATE POLICY "Admin update registrations" ON public.registrations
FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admin delete registrations" ON public.registrations
FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- ============= REGISTRATION_ROOMS =============
CREATE TABLE public.registration_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(registration_id, room_id)
);
ALTER TABLE public.registration_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone insert reg rooms" ON public.registration_rooms
FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff view reg rooms" ON public.registration_rooms
FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hostess')
);
CREATE POLICY "Admin delete reg rooms" ON public.registration_rooms
FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- ============= ROOM CHECK INS =============
CREATE TABLE public.room_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_by UUID,
  UNIQUE(registration_id, room_id)
);
ALTER TABLE public.room_check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view check_ins" ON public.room_check_ins
FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hostess')
);
CREATE POLICY "Staff insert check_ins" ON public.room_check_ins
FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hostess')
);
CREATE POLICY "Admin delete check_ins" ON public.room_check_ins
FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- ============= INDEXES =============
CREATE INDEX idx_rooms_event ON public.rooms(event_id);
CREATE INDEX idx_reg_event ON public.registrations(event_id);
CREATE INDEX idx_reg_qr ON public.registrations(qr_code);
CREATE INDEX idx_reg_rooms_reg ON public.registration_rooms(registration_id);
CREATE INDEX idx_reg_rooms_room ON public.registration_rooms(room_id);
CREATE INDEX idx_checkins_room ON public.room_check_ins(room_id);

-- ============= UPDATED_AT TRIGGER =============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_events_updated
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= REGISTER PARTICIPANT RPC =============
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
BEGIN
  -- Validate capacity for each requested room
  IF _room_ids IS NOT NULL THEN
    FOR rm IN
      SELECT r.id, r.name, r.capacity
      FROM public.rooms r
      WHERE r.id = ANY(_room_ids) AND r.event_id = _event_id
    LOOP
      IF rm.capacity IS NOT NULL THEN
        SELECT count(*) INTO current_count
        FROM public.registration_rooms rr
        WHERE rr.room_id = rm.id;
        IF current_count >= rm.capacity THEN
          RAISE EXCEPTION 'Plus de place pour la salle %', rm.name USING ERRCODE='P0001';
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Insert registration
  INSERT INTO public.registrations(event_id, first_name, last_name, email, phone)
  VALUES (_event_id, _first_name, _last_name, _email, _phone)
  RETURNING id, qr_code INTO rid, qrc;

  -- Link rooms
  IF _room_ids IS NOT NULL THEN
    INSERT INTO public.registration_rooms(registration_id, room_id)
    SELECT rid, unnest(_room_ids)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY SELECT rid, qrc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_participant(UUID,TEXT,TEXT,TEXT,TEXT,UUID[]) TO anon, authenticated;

-- ============= STORAGE BUCKET =============
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-assets', 'event-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read event assets" ON storage.objects
FOR SELECT USING (bucket_id = 'event-assets');

CREATE POLICY "Admin upload event assets" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'event-assets' AND has_role(auth.uid(),'admin')
);
CREATE POLICY "Admin update event assets" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'event-assets' AND has_role(auth.uid(),'admin')
);
CREATE POLICY "Admin delete event assets" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'event-assets' AND has_role(auth.uid(),'admin')
);

-- ============= REALTIME =============
ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_check_ins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.registration_rooms;

-- ============= SEED DEFAULT EVENT =============
INSERT INTO public.events (title, subtitle, description, event_date, time_range, location)
VALUES (
  'Participation au congrès',
  '15 Mai 2026',
  'Rejoignez-nous pour une journée exceptionnelle dédiée à l''innovation technologique. Conférences, ateliers et networking avec les leaders de l''industrie.',
  '2026-05-15',
  '09:00 - 18:00',
  'Algérie'
);


-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'employee');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles per security best practices)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Daily reports table
CREATE TABLE public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE,
  is_submitted BOOLEAN NOT NULL DEFAULT false,
  total_valor_recibido NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (employee_id, report_date)
);

-- Report items table
CREATE TABLE public.report_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  item_order INTEGER NOT NULL,
  hombre INTEGER NOT NULL DEFAULT 0,
  mujer INTEGER NOT NULL DEFAULT 0,
  nino INTEGER NOT NULL DEFAULT 0,
  total INTEGER GENERATED ALWAYS AS (hombre + mujer + nino) STORED,
  valor_recibido NUMERIC NOT NULL DEFAULT 0,
  observaciones TEXT
);

-- Report edit log (immutable audit)
CREATE TABLE public.report_edit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  edited_by UUID NOT NULL REFERENCES public.profiles(id),
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  edit_reason TEXT NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_daily_reports_employee_date ON public.daily_reports(employee_id, report_date);
CREATE INDEX idx_daily_reports_date ON public.daily_reports(report_date);
CREATE INDEX idx_report_items_report ON public.report_items(report_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==================== RLS ====================

-- Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = id);

CREATE POLICY "Admins can update any profile, users own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- User roles RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Daily reports RLS
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees see own reports, admins see all"
  ON public.daily_reports FOR SELECT
  USING (auth.uid() = employee_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees create own reports"
  ON public.daily_reports FOR INSERT
  WITH CHECK (auth.uid() = employee_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees update own today reports, admins update all"
  ON public.daily_reports FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      auth.uid() = employee_id
      AND report_date = CURRENT_DATE
    )
  );

CREATE POLICY "Admins can delete reports"
  ON public.daily_reports FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Report items RLS
ALTER TABLE public.report_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees see own report items, admins see all"
  ON public.report_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = report_id
      AND (dr.employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Employees insert own report items"
  ON public.report_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = report_id
      AND (dr.employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Employees update own today report items, admins all"
  ON public.report_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = report_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR (dr.employee_id = auth.uid() AND dr.report_date = CURRENT_DATE)
      )
    )
  );

CREATE POLICY "Admins can delete report items"
  ON public.report_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = report_id
      AND public.has_role(auth.uid(), 'admin')
    )
  );

-- Report edit log RLS (admin only, immutable)
ALTER TABLE public.report_edit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view edit logs"
  ON public.report_edit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert edit logs"
  ON public.report_edit_log FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

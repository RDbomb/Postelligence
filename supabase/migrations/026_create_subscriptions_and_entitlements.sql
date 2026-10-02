-- Migration 026: Subscriptions, Entitlements, and Usage Tracking

-- 1. Subscription status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM (
      'free',
      'trialing',
      'active',
      'past_due',
      'cancelled',
      'paused'
    );
  END IF;
END$$;

-- 2. User Subscriptions Table
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  tier TEXT NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter', 'pro', 'plus')),
  status subscription_status NOT NULL DEFAULT 'free',
  billing_type TEXT NOT NULL DEFAULT 'razorpay' CHECK (billing_type IN ('razorpay', 'manual_grant', 'lifetime', 'partner')),
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_plan_id TEXT,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ, -- NULL means permanent / lifetime access!
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Monthly Usage Tracking Table
CREATE TABLE IF NOT EXISTS public.user_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_posts_count INT NOT NULL DEFAULT 0,
  automated_posts_count INT NOT NULL DEFAULT 0,
  ai_words_generated INT NOT NULL DEFAULT 0,
  ai_images_generated INT NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Users can view own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own usage" ON public.user_usage;
CREATE POLICY "Users can view own usage"
  ON public.user_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do all operations
DROP POLICY IF EXISTS "Service role full access to subscriptions" ON public.user_subscriptions;
CREATE POLICY "Service role full access to subscriptions"
  ON public.user_subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to usage" ON public.user_usage;
CREATE POLICY "Service role full access to usage"
  ON public.user_usage
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Trigger to auto-create subscription & usage on new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, tier, status, billing_type)
  VALUES (NEW.id, 'starter', 'free', 'razorpay')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_usage (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_subscription();

-- 7. Backfill existing users if any
INSERT INTO public.user_subscriptions (user_id, tier, status, billing_type)
SELECT id, 'starter', 'free', 'razorpay'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_usage (user_id)
SELECT id
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
#!/usr/bin/env bash
# Register auth.sim.icanmena.com as the Supabase custom domain for project
# veokzbeaqenkdtkaltcg. Run after: supabase login
#
# DNS (add at your DNS provider for icanmena.com):
#   CNAME  auth.sim  ->  veokzbeaqenkdtkaltcg.supabase.co
#   TXT    _acme-challenge.auth.sim  ->  (printed by domains create)
#
# After activate, set in Vercel:
#   NEXT_PUBLIC_SUPABASE_URL=https://auth.sim.icanmena.com
#
# Google Cloud Console → OAuth client → Authorized redirect URIs:
#   https://auth.sim.icanmena.com/auth/v1/callback
#   (keep https://veokzbeaqenkdtkaltcg.supabase.co/auth/v1/callback until cutover)
#
# Supabase Dashboard → Authentication → URL Configuration:
#   Site URL: https://sim.icanmena.com
#   Redirect URLs: https://sim.icanmena.com/**

set -euo pipefail
PROJECT_REF="veokzbeaqenkdtkaltcg"
HOSTNAME="auth.sim.icanmena.com"

echo "==> Creating custom domain ${HOSTNAME} for project ${PROJECT_REF}"
supabase domains create --project-ref "${PROJECT_REF}" --custom-hostname "${HOSTNAME}"

echo ""
echo "==> Add the TXT record above to DNS, then reverify (repeat until verified):"
echo "    supabase domains reverify --project-ref ${PROJECT_REF}"
read -r -p "Press Enter after DNS TXT + CNAME are set and reverify succeeded..."

echo "==> Activating custom domain"
supabase domains activate --project-ref "${PROJECT_REF}"

echo ""
echo "Done. Next:"
echo "  1. Vercel: NEXT_PUBLIC_SUPABASE_URL=https://${HOSTNAME}"
echo "  2. Google OAuth: add https://${HOSTNAME}/auth/v1/callback"
echo "  3. Redeploy Vercel"
echo "  Google sign-in will show: ${HOSTNAME}"

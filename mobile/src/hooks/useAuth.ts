// Connexion Google/Apple via le flux OAuth web de Supabase (pas de SDK natif
// dédié) : supabase.auth.signInWithOAuth() renvoie une URL d'autorisation,
// ouverte dans un onglet navigateur système (expo-web-browser) ; au retour,
// les tokens sont dans le fragment de l'URL de redirection (scheme
// "walkedia://", voir app.json) et on établit la session manuellement.
// Nécessite un dev client (EAS Build) : Expo Go ne supporte pas les schemes
// d'URL personnalisés requis pour cette redirection.
//
// Connexion par e-mail (lien magique) : supabase.auth.signInWithOtp() envoie
// un mail contenant un lien vers "walkedia://" avec les mêmes tokens en
// fragment. On les récupère via l'écoute des deep links (Linking), à froid
// (app fermée, getInitialURL) comme à chaud (app déjà ouverte, l'event 'url').

import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type Provider = 'google' | 'apple';

function parseFragmentParams(url: string): Record<string, string> {
  const hashIdx = url.indexOf('#');
  const queryIdx = url.indexOf('?');
  const start = hashIdx >= 0 ? hashIdx + 1 : queryIdx >= 0 ? queryIdx + 1 : url.length;
  const raw = url.slice(start);
  const params: Record<string, string> = {};
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
  }
  return params;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Lien magique par e-mail : reçoit les tokens via deep link plutôt que via
  // WebBrowser.openAuthSessionAsync (l'utilisateur ouvre le mail depuis son
  // client mail, pas depuis un onglet ouvert par l'app).
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const applyUrl = async (url: string | null) => {
      if (!url) return;
      const params = parseFragmentParams(url);
      if (!params.access_token || !params.refresh_token) return;
      await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
    };
    Linking.getInitialURL().then(applyUrl);
    const sub = Linking.addEventListener('url', ({ url }) => applyUrl(url));
    return () => sub.remove();
  }, []);

  const signInWithProvider = useCallback(async (provider: Provider) => {
    setBusy(true);
    try {
      const redirectTo = AuthSession.makeRedirectUri({ scheme: 'walkedia' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('URL de connexion indisponible.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type !== 'success' || !result.url) throw new Error('Connexion interrompue.');

      const params = parseFragmentParams(result.url);
      if (params.error) throw new Error(params.error_description || params.error);
      if (!params.access_token || !params.refresh_token) {
        throw new Error('Réponse de connexion invalide.');
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (sessionError) throw sessionError;
    } finally {
      setBusy(false);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    setBusy(true);
    setEmailSent(false);
    try {
      const redirectTo = AuthSession.makeRedirectUri({ scheme: 'walkedia' });
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setEmailSent(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    busy,
    emailSent,
    isConfigured: isSupabaseConfigured,
    signInWithGoogle: () => signInWithProvider('google'),
    signInWithApple: () => signInWithProvider('apple'),
    signInWithEmail,
    signOut,
  };
}

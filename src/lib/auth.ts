import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { query } from "./db";
import crypto from "crypto";

const LINE_CLIENT_ID = process.env.LINE_CLIENT_ID || "";
const LINE_CLIENT_SECRET = process.env.LINE_CLIENT_SECRET || "";

const handler = NextAuth({
  trustHost: true,
  providers: [
    // LINE Login OAuth2
    {
      id: "line",
      name: "LINE",
      type: "oauth",
      clientId: LINE_CLIENT_ID,
      clientSecret: LINE_CLIENT_SECRET,
      authorization: {
        url: "https://access.line.me/oauth2/v2.1/authorize",
        params: {
          response_type: "code",
          scope: "profile openid",
          bot_prompt: "normal",
        },
      },
      token: "https://api.line.me/oauth2/v2.1/token",
      userinfo: "https://api.line.me/v2/profile",
      profile(profile: any) {
        return {
          id: profile.userId,
          name: profile.displayName || "LINE User",
          image: profile.pictureUrl || null,
          email: `${profile.userId}@line.oauth`,
        };
      },
      checks: ["state"],
    } as any,
    // Google OAuth
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
          }),
        ]
      : []),
    // Email/Password
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email);
        const password = String(credentials.password);
        const result = await query(
          "SELECT * FROM slip_processing.web_users WHERE email = $1 AND deleted_at IS NULL",
          [email]
        );
        if (result.rows.length === 0) return null;
        const user = result.rows[0];
        if (!user.password_hash) return null;
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;
        await query(
          "UPDATE slip_processing.web_users SET last_login_at = NOW() WHERE id = $1",
          [user.id]
        );
        return {
          id: user.id,
          email: user.email,
          name: user.display_name || user.email,
          image: null,
          role: user.role || "resident",
          houseNumber: user.house_number,
          preferredLang: user.preferred_language || "th",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }: any) {
      if (user) {
        token.role = user.role || "resident";
        token.houseNumber = user.houseNumber;
        token.preferredLang = user.preferredLang || "th";
      }
      if (account?.provider === "line") {
        token.lineAccessToken = account.access_token;
        token.lineRefreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.houseNumber = token.houseNumber;
        session.user.preferredLang = token.preferredLang || "th";
      }
      return session;
    },
    async signIn({ user, account }: any) {
      if (account?.provider === "line" || account?.provider === "google") {
        const providerId = account.providerAccountId;
        const email =
          user.email || `${providerId}@${account.provider}.oauth`;
        const displayName = user.name || "";
        const avatarUrl = user.image || null;

        const existing = await query(
          "SELECT * FROM slip_processing.web_users WHERE email = $1",
          [email]
        );

        if (existing.rows.length === 0) {
          const newId = crypto.randomUUID();
          await query(
            `INSERT INTO slip_processing.web_users (id, email, display_name, avatar_url, role, preferred_language, created_at)
             VALUES ($1, $2, $3, $4, 'resident', 'th', NOW())`,
            [newId, email, displayName, avatarUrl]
          );
          user.id = newId;
        } else {
          await query(
            "UPDATE slip_processing.web_users SET last_login_at = NOW(), avatar_url = COALESCE($2, avatar_url) WHERE id = $1",
            [existing.rows[0].id, avatarUrl]
          );
          user.id = existing.rows[0].id;
        }

        // Link OAuth account
        const oauthExisting = await query(
          "SELECT * FROM slip_processing.oauth_accounts WHERE provider = $1 AND (provider_user_id = $2 OR provider_account_id = $2)",
          [account.provider, providerId]
        );
        if (oauthExisting.rows.length === 0) {
          await query(
            `INSERT INTO slip_processing.oauth_accounts (id, user_id, provider, provider_user_id, provider_account_id, access_token, refresh_token, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              crypto.randomUUID(),
              user.id,
              account.provider,
              providerId,
              providerId,
              account.access_token || null,
              account.refresh_token || null,
            ]
          );
        }
      }
      return true;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
});

export const { handlers, auth, signIn, signOut } = handler;
export default handler;

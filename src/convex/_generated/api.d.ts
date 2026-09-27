/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as applications from "../applications.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as bank from "../bank.js";
import type * as bankActions from "../bankActions.js";
import type * as bookings from "../bookings.js";
import type * as chat from "../chat.js";
import type * as gamification from "../gamification.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as lib_fraud from "../lib/fraud.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_legacy_icons from "../lib/legacy_icons.js";
import type * as lib_payoutRisk from "../lib/payoutRisk.js";
import type * as lib_safety from "../lib/safety.js";
import type * as lib_security from "../lib/security.js";
import type * as lib_testing from "../lib/testing.js";
import type * as loginGuard from "../loginGuard.js";
import type * as migrations from "../migrations.js";
import type * as missions from "../missions.js";
import type * as notifications from "../notifications.js";
import type * as payments from "../payments.js";
import type * as profiles from "../profiles.js";
import type * as reviews from "../reviews.js";
import type * as safety from "../safety.js";
import type * as seed from "../seed.js";
import type * as stats from "../stats.js";
import type * as users from "../users.js";
import type * as wallet from "../wallet.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  applications: typeof applications;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  bank: typeof bank;
  bankActions: typeof bankActions;
  bookings: typeof bookings;
  chat: typeof chat;
  gamification: typeof gamification;
  http: typeof http;
  identity: typeof identity;
  "lib/fraud": typeof lib_fraud;
  "lib/helpers": typeof lib_helpers;
  "lib/legacy_icons": typeof lib_legacy_icons;
  "lib/payoutRisk": typeof lib_payoutRisk;
  "lib/safety": typeof lib_safety;
  "lib/security": typeof lib_security;
  "lib/testing": typeof lib_testing;
  loginGuard: typeof loginGuard;
  migrations: typeof migrations;
  missions: typeof missions;
  notifications: typeof notifications;
  payments: typeof payments;
  profiles: typeof profiles;
  reviews: typeof reviews;
  safety: typeof safety;
  seed: typeof seed;
  stats: typeof stats;
  users: typeof users;
  wallet: typeof wallet;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

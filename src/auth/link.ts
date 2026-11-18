import { linkGuest } from "@/db/queries/users";

/**
 * Better Auth `onLinkAccount` hook. Deliberately no try/catch: if the move fails the
 * error must propagate so sign up fails and the guest and their data are not deleted.
 */
export const linkGuestAccount = async (data: {
  readonly anonymousUser: { readonly user: { readonly id: string } };
  readonly newUser: { readonly user: { readonly id: string } };
}): Promise<void> => {
  await linkGuest(data.anonymousUser.user.id, data.newUser.user.id);
};

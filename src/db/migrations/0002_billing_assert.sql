-- Spec 0004: raise when a billing batch must abort as a whole (neon-http has no
-- interactive transactions, but one db.batch is one transaction, so a raise rolls it
-- all back). The message is the typed error code the query layer maps back.
CREATE OR REPLACE FUNCTION billing_assert(ok boolean, code text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = code;
  END IF;
END;
$$;

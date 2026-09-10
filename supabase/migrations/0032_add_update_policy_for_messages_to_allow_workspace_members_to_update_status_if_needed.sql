DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' AND policyname = 'Users can update messages via conversation'
  ) THEN
    CREATE POLICY "Users can update messages via conversation" ON public.messages
    FOR UPDATE TO public USING (
      EXISTS (
        SELECT 1 FROM conversations conv
        WHERE conv.id = messages.conversation_id AND is_workspace_member(conv.workspace_id)
      )
    );
  END IF;
END $$;
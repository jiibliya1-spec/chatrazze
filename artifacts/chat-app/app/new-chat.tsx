import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const NewChat = ({ user, search }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Guard: if user ID is not available, don't fetch
    if (!user?.id) {
      setUsers([]);
      setLoading(false);
      return;
    }

    let isActive = true;

    const fetchUsers = async () => {
      setLoading(true);

      try {
        let query = supabase.from("users").select("*").neq("id", user.id);

        const term = search.trim();
        if (term) {
          query = query.or(
            `display_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`
          );
        }

        const { data, error } = await query
          .order("display_name", { ascending: true })
          .limit(50);

        if (!isActive) return;

        if (error) {
          console.error("[NewChat] failed loading users", error);
          setUsers([]);
          return;
        }

        setUsers((data as User[]) ?? []);
      } catch (err) {
        if (!isActive) return;
        console.error("[NewChat] fetchUsers error:", err);
        setUsers([]);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    const timer = setTimeout(fetchUsers, 300);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [search, user?.id]);

  return (
    <div>
      {loading ? <p>Loading...</p> : <UserList users={users} />}
    </div>
  );
};

export default NewChat;

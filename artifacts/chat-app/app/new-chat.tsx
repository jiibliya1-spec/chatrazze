useEffect(() => {
  console.log(`user.id at start: ${user.id}`);
  const loadUsers = async () => {
    console.log('Creating query...');
    let query = `SELECT * FROM users`; // Adjust this query as necessary

    if (searchFilter) {
      console.log(`Applying search filter: ${searchFilter}`);
      query += ` WHERE name LIKE '%${searchFilter}%'`;
    }

    console.log('Before executing query...');
    try {
      setLoading(true);
      const response = await fetchData(query);
      console.log('After query execution, data length: ', response.length);
      setUsers(response);
    } catch (error) {
      console.error('Error fetching users: ', error);
    } finally {
      setLoading(false);
    }
  };

  loadUsers();
}, [searchFilter]);
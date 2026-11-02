# LifeLink — MongoDB Atlas setup and donor navigation

## What was updated
- The donor portal navbar now has a **Profile** link that jumps to the donor's name/photo card.
- Donor entry links on the home page take an already signed-in donor directly to the donor portal. The JWT session is retained in browser storage, so returning Home → Donor Portal does not require signing in again.
- The existing donor profile picture flow uses Multer (`profilePicture` form field), stores the image under `uploads/profiles/`, and saves the image path in MongoDB.
- The existing Express/Mongoose registration, bcrypt password hashing, JWT authentication, and donor-role authorization are retained.
- `.env` is intentionally not included because it contains private credentials.

## 1. Configure MongoDB Atlas
1. In Atlas, open your cluster and choose **Connect → Drivers → Node.js**.
2. Copy the connection string.
3. In the project root, create a file named `.env` (same folder as `server.js`).
4. Add:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://DB_USERNAME:DB_PASSWORD@YOUR_CLUSTER_HOST/lifelink?retryWrites=true&w=majority
JWT_SECRET=replace_this_with_a_long_random_secret
```

Replace the username, password, and cluster host with your Atlas **Database Access** user and cluster values. Do not use your Atlas website login password. If the database password contains special characters, URL-encode them in the connection string. In Atlas **Network Access**, allow your current IP address.

## 2. Install and start
Open a terminal in the project root:

```bash
npm install
npm start
```

Open `http://localhost:5000`. Do not use VS Code Live Server; the Express server serves the HTML pages and API.

Check `http://localhost:5000/api/health`. It should report the database as connected.

## 3. Test donor registration and persistence
1. Register a new donor with a unique email address.
2. After registration, the donor should land in the donor portal.
3. Upload a JPG, PNG, or WEBP profile photo (maximum 2 MB).
4. Click **Home**, then **Donor Portal** / **Open Donor Profile**. The existing donor session should open the portal without asking for login again.
5. In Atlas, open **Cluster0 → Browse Collections → Refresh**. The project uses the `lifelink` database. User and donor profile records are stored in the `users` and `donorprofiles` collections. The photo file itself is stored on the server in `uploads/profiles/`; its URL/path is stored in the donor profile document.

## Important
- Never share or upload your `.env` file, Atlas password, or JWT secret.
- Local uploaded photos are stored on the server disk. For production hosting with multiple server instances, use durable object storage (for example Azure Blob Storage or S3) instead of local disk.
- Existing demo seed data is retained because the donor application workflow needs demo hospital records. New registrations and submissions are persisted in MongoDB.

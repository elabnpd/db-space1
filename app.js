// ============================================================
// DB SPACE
// GitHub File Storage
// app.js
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

const GITHUB_OWNER = "elabnpd";
const GITHUB_REPO = "DB_SPACE";
const GITHUB_BRANCH = "main";
const GITHUB_FOLDER = "files";


// Your GitHub App Client ID
const GITHUB_CLIENT_ID =
    "Iv23liuJ6PzKlCSkbWpL";


// Your Cloudflare Worker BASE URL
//
// Example:
// https://db-space-auth.xxxxx.workers.dev
//
// DO NOT add /exchange here.
//
const WORKER_URL =
    "https://db-space.elab-npd.workers.dev";


// GitHub App callback URL
const REDIRECT_URI =
    "https://elabnpd.github.io/DB_SPACE/";


// GitHub API
const API_BASE =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;


// Browser session keys
const TOKEN_KEY =
    "dbspace_github_token";

const STATE_KEY =
    "dbspace_oauth_state";

const VERIFIER_KEY =
    "dbspace_code_verifier";


// ============================================================
// START
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        console.log(
            "DB SPACE application started"
        );

        setupFileInput();

        setupDragAndDrop();

        // Handle GitHub redirect first
        await handleOAuthCallback();

        // Check existing session
        const token =
            sessionStorage.getItem(
                TOKEN_KEY
            );

        if (token) {

            console.log(
                "Existing GitHub session found"
            );

            const connected =
                await testGitHubConnection();

            if (connected) {

                showApplication();

                await loadFiles();

            } else {

                showLogin();
            }

        } else {

            showLogin();
        }

    }
);


// ============================================================
// CONTINUE WITH GITHUB
// ============================================================

async function continueWithGitHub() {

    console.log(
        "Continue with GitHub clicked"
    );


    const token =
        sessionStorage.getItem(
            TOKEN_KEY
        );


    // Already logged in
    if (token) {

        console.log(
            "Existing token found"
        );


        const connected =
            await testGitHubConnection();


        if (connected) {

            showApplication();

            await loadFiles();

            return;
        }


        // Token no longer valid
        sessionStorage.removeItem(
            TOKEN_KEY
        );
    }


    // Start new OAuth login
    await loginWithGitHub();
}


window.continueWithGitHub =
    continueWithGitHub;


// ============================================================
// LOGIN WITH GITHUB
// ============================================================

async function loginWithGitHub() {

    console.log(
        "Starting GitHub OAuth login..."
    );


    if (
        !GITHUB_CLIENT_ID ||
        GITHUB_CLIENT_ID ===
            "YOUR_GITHUB_CLIENT_ID"
    ) {

        showError(
            "GitHub Client ID is not configured."
        );

        return;
    }


    if (
        !WORKER_URL ||
        WORKER_URL ===
            "YOUR_CLOUDFLARE_WORKER_URL"
    ) {

        showError(
            "Cloudflare Worker URL is not configured."
        );

        return;
    }


    try {

        // Generate OAuth state
        const state =
            generateRandomString(32);


        // Generate PKCE verifier
        const verifier =
            generateRandomString(64);


        // Generate PKCE challenge
        const challenge =
            await generateCodeChallenge(
                verifier
            );


        // Save state
        sessionStorage.setItem(
            STATE_KEY,
            state
        );


        // Save verifier
        sessionStorage.setItem(
            VERIFIER_KEY,
            verifier
        );


        // GitHub authorization URL
        const params =
            new URLSearchParams();


        params.set(
            "client_id",
            GITHUB_CLIENT_ID
        );


        params.set(
            "redirect_uri",
            REDIRECT_URI
        );


        params.set(
            "response_type",
            "code"
        );


        params.set(
            "state",
            state
        );


        params.set(
            "code_challenge",
            challenge
        );


        params.set(
            "code_challenge_method",
            "S256"
        );


        const authorizationURL =
            "https://github.com/login/oauth/authorize?" +
            params.toString();


        console.log(
            "Redirecting to GitHub..."
        );


        // IMPORTANT:
        // We redirect the browser.
        //
        // We DO NOT fetch GitHub's
        // /login/device/code endpoint.
        //
        window.location.href =
            authorizationURL;

    }

    catch (error) {

        console.error(
            "OAuth start error:",
            error
        );

        showError(
            "GitHub login failed: " +
            error.message
        );
    }
}


window.loginWithGitHub =
    loginWithGitHub;


// ============================================================
// HANDLE OAUTH CALLBACK
// ============================================================

async function handleOAuthCallback() {

    const urlParams =
        new URLSearchParams(
            window.location.search
        );


    const code =
        urlParams.get("code");


    const state =
        urlParams.get("state");


    const error =
        urlParams.get("error");


    // Nothing returned
    if (!code && !error) {

        return;
    }


    console.log(
        "GitHub OAuth callback detected"
    );


    // GitHub returned an error
    if (error) {

        const description =
            urlParams.get(
                "error_description"
            );


        showError(
            "GitHub authorization failed: " +
            (description || error)
        );


        cleanURL();

        return;
    }


    // Get stored state
    const savedState =
        sessionStorage.getItem(
            STATE_KEY
        );


    // Validate state
    if (
        !state ||
        !savedState ||
        state !== savedState
    ) {

        console.error(
            "OAuth state mismatch"
        );


        showError(
            "GitHub login failed: OAuth state mismatch."
        );


        clearOAuthData();

        cleanURL();

        return;
    }


    // Get PKCE verifier
    const verifier =
        sessionStorage.getItem(
            VERIFIER_KEY
        );


    if (!verifier) {

        showError(
            "GitHub login failed: PKCE verifier missing."
        );


        clearOAuthData();

        cleanURL();

        return;
    }


    try {

        setStatus(
            "Connecting to GitHub..."
        );


        console.log(
            "Sending OAuth code to Cloudflare Worker..."
        );


        // ====================================================
        // THIS IS THE ONLY FETCH TO OUR WORKER
        // ====================================================

        const response =
            await fetch(
                `${WORKER_URL}/exchange`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            code:
                                code,

                            redirect_uri:
                                REDIRECT_URI,

                            code_verifier:
                                verifier

                        })
                }
            );


        const data =
            await response.json();


        console.log(
            "Worker response:",
            data
        );


        if (!response.ok) {

            throw new Error(
                data.error_description ||
                data.error ||
                data.message ||
                "Token exchange failed"
            );
        }


        if (!data.access_token) {

            throw new Error(
                "No access token returned by Worker."
            );
        }


        // Save token
        sessionStorage.setItem(
            TOKEN_KEY,
            data.access_token
        );


        clearOAuthData();


        // Remove ?code=...
        cleanURL();


        console.log(
            "GitHub authentication successful"
        );


        // Verify token
        const connected =
            await testGitHubConnection();


        if (!connected) {

            throw new Error(
                "GitHub token could not be verified."
            );
        }


        showApplication();


        await loadFiles();


    }

    catch (error) {

        console.error(
            "OAuth callback error:",
            error
        );


        showError(
            "GitHub login failed: " +
            error.message
        );


        clearOAuthData();

        cleanURL();
    }
}


// ============================================================
// TEST GITHUB CONNECTION
// ============================================================

async function testGitHubConnection() {

    const token =
        sessionStorage.getItem(
            TOKEN_KEY
        );


    if (!token) {

        return false;
    }


    try {

        const response =
            await fetch(
                "https://api.github.com/user",
                {
                    method: "GET",

                    headers: {

                        "Authorization":
                            `Bearer ${token}`,

                        "Accept":
                            "application/vnd.github+json"
                    }
                }
            );


        if (!response.ok) {

            console.error(
                "GitHub API error:",
                response.status
            );


            if (
                response.status === 401 ||
                response.status === 403
            ) {

                sessionStorage.removeItem(
                    TOKEN_KEY
                );
            }


            return false;
        }


        const user =
            await response.json();


        console.log(
            "Authenticated GitHub user:",
            user.login
        );


        updateUserInfo(
            user
        );


        return true;

    }

    catch (error) {

        console.error(
            "GitHub connection error:",
            error
        );


        return false;
    }
}


// ============================================================
// LOAD FILES
// ============================================================

async function loadFiles() {

    const token =
        sessionStorage.getItem(
            TOKEN_KEY
        );


    if (!token) {

        return;
    }


    try {

        setStatus(
            "Loading files..."
        );


        const url =
            `${API_BASE}/contents/${GITHUB_FOLDER}` +
            `?ref=${encodeURIComponent(GITHUB_BRANCH)}`;


        const response =
            await fetch(
                url,
                {
                    headers: {

                        "Authorization":
                            `Bearer ${token}`,

                        "Accept":
                            "application/vnd.github+json"
                    }
                }
            );


        // files/ doesn't exist yet
        if (response.status === 404) {

            displayFiles([]);

            setStatus(
                "Ready"
            );

            return;
        }


        if (!response.ok) {

            const data =
                await response.json();


            throw new Error(
                data.message ||
                "Unable to load files."
            );
        }


        const files =
            await response.json();


        displayFiles(
            files
        );


        setStatus(
            "Ready"
        );

    }

    catch (error) {

        console.error(
            "Load files error:",
            error
        );


        showError(
            "Unable to load files: " +
            error.message
        );


        setStatus(
            "Error"
        );
    }
}


// ============================================================
// DISPLAY FILES
// ============================================================

function displayFiles(files) {

    const container =
        document.getElementById(
            "fileList"
        );


    if (!container) {

        console.error(
            "#fileList does not exist"
        );

        return;
    }


    container.innerHTML = "";


    if (
        !files ||
        files.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-files">
                No files uploaded yet.
            </div>
        `;

        return;
    }


    files.forEach(
        file => {

            if (
                file.type !== "file"
            ) {

                return;
            }


            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "file-row";


            const name =
                document.createElement(
                    "div"
                );


            name.className =
                "file-name";


            name.textContent =
                file.name;


            const size =
                document.createElement(
                    "div"
                );


            size.className =
                "file-size";


            size.textContent =
                formatBytes(
                    file.size
                );


            const download =
                document.createElement(
                    "button"
                );


            download.className =
                "download-button";


            download.textContent =
                "Download";


            download.onclick =
                function () {

                    downloadFile(
                        file.name
                    );
                };


            const deleteButton =
                document.createElement(
                    "button"
                );


            deleteButton.className =
                "delete-button";


            deleteButton.textContent =
                "Delete";


            deleteButton.onclick =
                function () {

                    deleteFile(
                        file.name,
                        file.sha
                    );
                };


            row.appendChild(
                name
            );


            row.appendChild(
                size
            );


            row.appendChild(
                download
            );


            row.appendChild(
                deleteButton
            );


            container.appendChild(
                row
            );
        }
    );
}


// ============================================================
// FILE INPUT
// ============================================================

function setupFileInput() {

    const input =
        document.getElementById(
            "fileInput"
        );


    const dropZone =
        document.getElementById(
            "dropZone"
        );


    if (!input || !dropZone) {

        return;
    }


    dropZone.addEventListener(
        "click",
        function () {

            input.click();
        }
    );


    input.addEventListener(
        "change",
        function (event) {

            const files =
                event.target.files;


            if (!files) {

                return;
            }


            for (
                const file of files
            ) {

                uploadFile(
                    file
                );
            }


            input.value = "";
        }
    );
}


// ============================================================
// DRAG & DROP
// ============================================================

function setupDragAndDrop() {

    const zone =
        document.getElementById(
            "dropZone"
        );


    if (!zone) {

        return;
    }


    zone.addEventListener(
        "dragover",
        function (event) {

            event.preventDefault();

            zone.classList.add(
                "drag-over"
            );
        }
    );


    zone.addEventListener(
        "dragleave",
        function () {

            zone.classList.remove(
                "drag-over"
            );
        }
    );


    zone.addEventListener(
        "drop",
        function (event) {

            event.preventDefault();


            zone.classList.remove(
                "drag-over"
            );


            const files =
                event.dataTransfer.files;


            for (
                const file of files
            ) {

                uploadFile(
                    file
                );
            }
        }
    );
}


// ============================================================
// UPLOAD FILE
// ============================================================

async function uploadFile(file) {

    const token =
        sessionStorage.getItem(
            TOKEN_KEY
        );


    if (!token) {

        showError(
            "Please login with GitHub first."
        );

        return;
    }


    if (!file) {

        return;
    }


    // GitHub Contents API maximum
    if (
        file.size >
        100 * 1024 * 1024
    ) {

        showError(
            "Maximum file size is 100 MB."
        );

        return;
    }


    try {

        setStatus(
            `Uploading ${file.name}...`
        );


        const base64 =
            await fileToBase64(
                file
            );


        const path =
            `${GITHUB_FOLDER}/${file.name}`;


        // Check whether file already exists
        let sha = null;


        const checkResponse =
            await fetch(
                `${API_BASE}/contents/${path}` +
                `?ref=${GITHUB_BRANCH}`,
                {
                    headers: {

                        "Authorization":
                            `Bearer ${token}`,

                        "Accept":
                            "application/vnd.github+json"
                    }
                }
            );


        if (
            checkResponse.ok
        ) {

            const existing =
                await checkResponse.json();


            sha =
                existing.sha;
        }


        const body = {

            message:
                sha
                    ? `Update ${file.name}`
                    : `Upload ${file.name}`,

            content:
                base64,

            branch:
                GITHUB_BRANCH
        };


        if (sha) {

            body.sha =
                sha;
        }


        const response =
            await fetch(
                `${API_BASE}/contents/${path}`,
                {
                    method: "PUT",

                    headers: {

                        "Authorization":
                            `Bearer ${token}`,

                        "Accept":
                            "application/vnd.github+json",

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            body
                        )
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Upload failed."
            );
        }


        console.log(
            "Upload successful:",
            file.name
        );


        setStatus(
            `${file.name} uploaded`
        );


        await loadFiles();

    }

    catch (error) {

        console.error(
            "Upload error:",
            error
        );


        showError(
            "Upload failed: " +
            error.message
        );
    }
}


window.uploadFile =
    uploadFile;


// ============================================================
// DOWNLOAD
// ============================================================

async function downloadFile(
    filename
) {

    const token =
        sessionStorage.getItem(
            TOKEN_KEY
        );


    if (!token) {

        showError(
            "Please login first."
        );

        return;
    }


    try {

        setStatus(
            `Downloading ${filename}...`
        );


        const path =
            `${GITHUB_FOLDER}/${filename}`;


        const response =
            await fetch(
                `${API_BASE}/contents/${path}` +
                `?ref=${GITHUB_BRANCH}`,
                {
                    headers: {

                        "Authorization":
                            `Bearer ${token}`,

                        "Accept":
                            "application/vnd.github.raw"
                    }
                }
            );


        if (!response.ok) {

            throw new Error(
                "Download failed."
            );
        }


        const blob =
            await response.blob();


        const url =
            URL.createObjectURL(
                blob
            );


        const link =
            document.createElement(
                "a"
            );


        link.href =
            url;


        link.download =
            filename;


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();


        URL.revokeObjectURL(
            url
        );


        setStatus(
            "Ready"
        );

    }

    catch (error) {

        console.error(
            "Download error:",
            error
        );


        showError(
            "Download failed: " +
            error.message
        );
    }
}


window.downloadFile =
    downloadFile;


// ============================================================
// DELETE
// ============================================================

async function deleteFile(
    filename,
    sha
) {

    const token =
        sessionStorage.getItem(
            TOKEN_KEY
        );


    if (!token) {

        showError(
            "Please login first."
        );

        return;
    }


    if (
        !confirm(
            `Delete "${filename}"?`
        )
    ) {

        return;
    }


    try {

        setStatus(
            `Deleting ${filename}...`
        );


        const path =
            `${GITHUB_FOLDER}/${filename}`;


        const response =
            await fetch(
                `${API_BASE}/contents/${path}`,
                {
                    method: "DELETE",

                    headers: {

                        "Authorization":
                            `Bearer ${token}`,

                        "Accept":
                            "application/vnd.github+json",

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            message:
                                `Delete ${filename}`,

                            sha:
                                sha,

                            branch:
                                GITHUB_BRANCH
                        })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Delete failed."
            );
        }


        await loadFiles();


        setStatus(
            `${filename} deleted`
        );

    }

    catch (error) {

        console.error(
            "Delete error:",
            error
        );


        showError(
            "Delete failed: " +
            error.message
        );
    }
}


window.deleteFile =
    deleteFile;


// ============================================================
// LOGOUT
// ============================================================

function logoutGitHub() {

    sessionStorage.removeItem(
        TOKEN_KEY
    );


    sessionStorage.removeItem(
        STATE_KEY
    );


    sessionStorage.removeItem(
        VERIFIER_KEY
    );


    showLogin();


    setStatus(
        "Logged out"
    );
}


window.logoutGitHub =
    logoutGitHub;


// ============================================================
// UI
// ============================================================

function showApplication() {

    const login =
        document.getElementById(
            "loginPage"
        );


    const app =
        document.getElementById(
            "appPage"
        );


    const headerButton =
        document.getElementById(
            "headerLoginButton"
        );


    if (login) {

        login.style.display =
            "none";
    }


    if (app) {

        app.style.display =
            "block";
    }


    if (headerButton) {

        headerButton.style.display =
            "none";
    }
}


function showLogin() {

    const login =
        document.getElementById(
            "loginPage"
        );


    const app =
        document.getElementById(
            "appPage"
        );


    const headerButton =
        document.getElementById(
            "headerLoginButton"
        );


    if (login) {

        login.style.display =
            "flex";
    }


    if (app) {

        app.style.display =
            "none";
    }


    if (headerButton) {

        headerButton.style.display =
            "block";
    }
}


// ============================================================
// USER INFO
// ============================================================

function updateUserInfo(user) {

    document
        .querySelectorAll(
            "[data-github-username]"
        )
        .forEach(
            element => {

                element.textContent =
                    user.login;
            }
        );


    document
        .querySelectorAll(
            "[data-github-avatar]"
        )
        .forEach(
            element => {

                element.src =
                    user.avatar_url;
            }
        );
}


// ============================================================
// STATUS
// ============================================================

function setStatus(message) {

    console.log(
        "STATUS:",
        message
    );


    const status =
        document.getElementById(
            "connectionStatus"
        );


    if (status) {

        status.textContent =
            message;
    }
}


// ============================================================
// ERROR
// ============================================================

function showError(message) {

    console.error(
        message
    );


    const box =
        document.getElementById(
            "alertBox"
        );


    if (!box) {

        alert(message);

        return;
    }


    box.textContent =
        message;


    box.style.display =
        "block";
}


// ============================================================
// CLEAN OAUTH DATA
// ============================================================

function clearOAuthData() {

    sessionStorage.removeItem(
        STATE_KEY
    );


    sessionStorage.removeItem(
        VERIFIER_KEY
    );
}


// ============================================================
// CLEAN URL
// ============================================================

function cleanURL() {

    const cleanURL =
        window.location.origin +
        window.location.pathname;


    window.history.replaceState(
        {},
        document.title,
        cleanURL
    );
}


// ============================================================
// RANDOM STRING
// ============================================================

function generateRandomString(
    length
) {

    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
        "abcdefghijklmnopqrstuvwxyz" +
        "0123456789-._~";


    const values =
        new Uint8Array(
            length
        );


    crypto.getRandomValues(
        values
    );


    return Array.from(
        values,
        value =>
            characters[
                value %
                characters.length
            ]
    ).join("");
}


// ============================================================
// PKCE
// ============================================================

async function generateCodeChallenge(
    verifier
) {

    const data =
        new TextEncoder()
            .encode(
                verifier
            );


    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );


    return base64URL(
        new Uint8Array(
            digest
        )
    );
}


function base64URL(bytes) {

    let binary = "";


    for (
        const byte of bytes
    ) {

        binary +=
            String.fromCharCode(
                byte
            );
    }


    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}


// ============================================================
// FILE -> BASE64
// ============================================================

function fileToBase64(
    file
) {

    return new Promise(
        (resolve, reject) => {

            const reader =
                new FileReader();


            reader.onload =
                function () {

                    const result =
                        reader.result;


                    const base64 =
                        result.split(",")[1];


                    resolve(
                        base64
                    );
                };


            reader.onerror =
                function () {

                    reject(
                        new Error(
                            "Unable to read file."
                        )
                    );
                };


            reader.readAsDataURL(
                file
            );
        }
    );
}


// ============================================================
// FILE SIZE
// ============================================================

function formatBytes(
    bytes
) {

    if (!bytes) {

        return "0 Bytes";
    }


    const units = [
        "Bytes",
        "KB",
        "MB",
        "GB"
    ];


    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    return (
        parseFloat(
            (
                bytes /
                Math.pow(
                    1024,
                    index
                )
            ).toFixed(2)
        ) +
        " " +
        units[index]
    );
}
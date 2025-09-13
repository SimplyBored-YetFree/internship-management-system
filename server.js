const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// For env vars (Aiven MySQL)
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

// Database configuration with environment variables and SSL
const dbConfig = {
    host: process.env.DB_HOST || 'mysql-prod-team-11-db.d.aivencloud.com',
    port: parseInt(process.env.DB_PORT) || 18747,
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || 'AVNS_LX08vO8haomAurd81HH',
    database: process.env.DB_NAME || 'defaultdb'
};

// Add SSL configuration using base64-encoded env var (for Vercel serverless)
if (process.env.NODE_ENV === 'production' && process.env.DB_SSL_CA) {
    try {
        dbConfig.ssl = {
            ca: Buffer.from(process.env.DB_SSL_CA, 'base64'),
            rejectUnauthorized: true
        };
        console.log('SSL certificate loaded from environment variable');
    } catch (error) {
        console.error('Warning: Could not load SSL certificate from env var:', error.message);
    }
} else {
    console.log('Warning: Connecting without SSL (not recommended for production)');
}

const db = mysql.createConnection(dbConfig);

db.connect(err => { 
    if (err) {
        console.error('MySQL Connection Error:', err);
    } else {
        console.log('MySQL Connected to Aiven'); 
    }
});

// Multer with memory storage (for Vercel read-only file system)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Simple session (store user_id, role in memory) - Note: In serverless, this resets per invocation; use cookies or DB for persistence in production
let sessions = {};

// Routes
app.get('/', (req, res) => res.render('index'));

app.get('/student-login', (req, res) => res.render('student-login'));

app.post('/student/login', (req, res) => {
    const { email, password, name, reg_no, semester } = req.body;
    db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) {
            console.error('Login query error:', err);
            return res.status(500).send('Database error');
        }
        if (results.length === 0) return res.status(401).send('Invalid Credentials');
        const user = results[0];
        if (user.role !== 'student') return res.status(403).send('Not a student');
        sessions[email] = { user_id: user.id, role: user.role };
        db.query('INSERT INTO students (user_id, reg_no, semester) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE semester = ?', 
            [user.id, reg_no, semester, semester], err => {
                if (err) {
                    console.error('Student insert error:', err);
                    return res.status(500).send('Database error');
                }
                res.redirect('/student-dashboard');
            });
    });
});

app.get('/student-dashboard', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'student');
    if (!user) return res.redirect('/student-login');
    db.query('SELECT u.name, s.reg_no, s.semester FROM users u JOIN students s ON u.id = s.user_id WHERE u.id = ?', [user.user_id], (err, students) => {
        if (err) {
            console.error('Student dashboard query error:', err);
            return res.status(500).send('Database error');
        }
        db.query('SELECT * FROM internships WHERE student_id = (SELECT id FROM students WHERE user_id = ?)', [user.user_id], (err, internships) => {
            if (err) {
                console.error('Internships query error:', err);
                return res.status(500).send('Database error');
            }
            const internship = internships[0] || null;
            db.query('SELECT * FROM evaluations WHERE internship_id = ?', [internship?.id], (err, evaluations) => {
                if (err) {
                    console.error('Evaluations query error:', err);
                    return res.status(500).send('Database error');
                }
                res.render('student-dashboard', { student: students[0], internship, evaluation: evaluations[0] });
            });
        });
    });
});

app.get('/internship-submission', (req, res) => {
    if (!Object.values(sessions).find(s => s.role === 'student')) return res.redirect('/student-login');
    res.render('internship-submission');
});

app.post('/student/submit-internship', upload.fields([{ name: 'offer_letter' }, { name: 'completion_letter' }, { name: 'lor' }]), (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'student');
    if (!user) return res.redirect('/student-login');
    const { company_name, role, company_link, stipend, contact_mail, start_date, end_date, company_mentor } = req.body;
    const files = req.files;
    db.query('SELECT id FROM students WHERE user_id = ?', [user.user_id], (err, students) => {
        if (err) {
            console.error('Student lookup error:', err);
            return res.status(500).send('Database error');
        }
        const student_id = students[0].id;
        // Use file names or simulate upload (since no disk; for real storage, use Cloudinary)
        const offer_letter = files.offer_letter ? files.offer_letter[0].originalname : null;
        const completion_letter = files.completion_letter ? files.completion_letter[0].originalname : null;
        const lor = files.lor ? files.lor[0].originalname : null;
        // Insert/update with file names (update table to store names/URLs)
        db.query('INSERT INTO internships (student_id, company_name, role, company_link, stipend, contact_mail, start_date, end_date, company_mentor, offer_letter, completion_letter, lor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE company_name = ?, role = ?, company_link = ?, stipend = ?, contact_mail = ?, start_date = ?, end_date = ?, company_mentor = ?, offer_letter = ?, completion_letter = ?, lor = ?', 
            [student_id, company_name, role, company_link, stipend, contact_mail, start_date, end_date, company_mentor, 
             offer_letter, completion_letter, lor,
             company_name, role, company_link, stipend, contact_mail, start_date, end_date, company_mentor, 
             offer_letter, completion_letter, lor], 
            err => {
                if (err) {
                    console.error('Internship submission error:', err);
                    return res.status(500).send('Database error');
                }
                res.redirect('/student-dashboard');
            });
    });
});

app.get('/faculty-login', (req, res) => res.render('faculty-login'));

app.post('/faculty/login', (req, res) => {
    const { faculty_id, password } = req.body;
    db.query('SELECT u.* FROM users u JOIN faculty f ON u.id = f.user_id WHERE f.faculty_id = ? AND u.password = ?', [faculty_id, password], (err, results) => {
        if (err) {
            console.error('Faculty login query error:', err);
            return res.status(500).send('Database error');
        }
        if (results.length === 0) return res.status(401).send('Invalid Credentials');
        const user = results[0];
        if (user.role !== 'faculty') return res.status(403).send('Not a faculty');
        sessions[user.email] = { user_id: user.id, role: user.role };
        res.redirect('/faculty-dashboard');
    });
});

app.get('/faculty-dashboard', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    db.query('SELECT u.name, s.reg_no, s.semester, s.id FROM users u JOIN students s ON u.id = s.user_id', (err, students) => {
        if (err) {
            console.error('Faculty dashboard query error:', err);
            return res.status(500).send('Database error');
        }
        res.render('faculty-dashboard', { students });
    });
});

app.get('/evaluation-form', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const student_id = req.query.student_id;
    res.render('evaluation-form', { student_id });
});

app.post('/faculty/submit-evaluation', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const { student_id, technical_skill, initiative, communication, professionalism, timely_completion, skills_gained, soft_skills, tools_used, code, research, documentation, testing, meetings } = req.body;
    const task_types = { code, research, documentation, testing, meetings };
    db.query('SELECT id FROM internships WHERE student_id = ?', [student_id], (err, internships) => {
        if (err) {
            console.error('Internship lookup error:', err);
            return res.status(500).send('Database error');
        }
        if (!internships[0]) return res.status(404).send('No internship found');
        const internship_id = internships[0].id;
        db.query('INSERT INTO evaluations (internship_id, technical_skill, initiative, communication, professionalism, timely_completion, skills_gained, soft_skills, tools_used, task_types) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE technical_skill = ?, initiative = ?, communication = ?, professionalism = ?, timely_completion = ?, skills_gained = ?, soft_skills = ?, tools_used = ?, task_types = ?', 
            [internship_id, technical_skill, initiative, communication, professionalism, timely_completion, skills_gained, soft_skills, tools_used, JSON.stringify(task_types),
             technical_skill, initiative, communication, professionalism, timely_completion, skills_gained, soft_skills, tools_used, JSON.stringify(task_types)], 
            err => {
                if (err) {
                    console.error('Evaluation submission error:', err);
                    return res.status(500).send('Database error');
                }
                res.redirect('/faculty-dashboard');
            });
    });
});

app.get('/view-attachments', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const student_id = req.query.student_id;
    db.query('SELECT * FROM internships WHERE student_id = ?', [student_id], (err, internships) => {
        if (err) {
            console.error('Attachments query error:', err);
            return res.status(500).send('Database error');
        }
        res.render('view-attachments', { internship: internships[0] || {} });
    });
});

app.get('/group-management', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    db.query('SELECT id FROM faculty WHERE user_id = ?', [user.user_id], (err, faculty) => {
        if (err) {
            console.error('Faculty lookup error:', err);
            return res.status(500).send('Database error');
        }
        db.query('SELECT * FROM groups_table WHERE faculty_id = ?', [faculty[0].id], (err, groups) => {
            if (err) {
                console.error('Groups query error:', err);
                return res.status(500).send('Database error');
            }
            res.render('group-management', { groups });
        });
    });
});

app.post('/faculty/create-group', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const { name } = req.body;
    db.query('SELECT id FROM faculty WHERE user_id = ?', [user.user_id], (err, faculty) => {
        if (err) {
            console.error('Faculty lookup error:', err);
            return res.status(500).send('Database error');
        }
        db.query('INSERT INTO groups_table (faculty_id, name) VALUES (?, ?)', [faculty[0].id, name], err => {
            if (err) {
                console.error('Group creation error:', err);
                return res.status(500).send('Database error');
            }
            res.redirect('/group-management');
        });
    });
});

app.post('/faculty/add-student-to-group', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const { group_id, reg_no } = req.body;
    db.query('SELECT id FROM students WHERE reg_no = ?', [reg_no], (err, students) => {
        if (err) {
            console.error('Student lookup error:', err);
            return res.status(500).send('Database error');
        }
        if (!students[0]) return res.status(404).send('Student not found');
        db.query('INSERT INTO group_students (group_id, student_id) VALUES (?, ?)', [group_id, students[0].id], err => {
            if (err) {
                console.error('Group student addition error:', err);
                return res.status(500).send('Database error');
            }
            db.query('UPDATE students SET mentor_id = (SELECT faculty_id FROM groups_table WHERE id = ?) WHERE id = ?', [group_id, students[0].id], err => {
                if (err) {
                    console.error('Mentor assignment error:', err);
                    return res.status(500).send('Database error');
                }
                res.redirect('/group-management');
            });
        });
    });
});

app.post('/faculty/remove-student-from-group', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const { group_id, reg_no } = req.body;
    db.query('SELECT id FROM students WHERE reg_no = ?', [reg_no], (err, students) => {
        if (err) {
            console.error('Student lookup error:', err);
            return res.status(500).send('Database error');
        }
        if (!students[0]) return res.status(404).send('Student not found');
        db.query('DELETE FROM group_students WHERE group_id = ? AND student_id = ?', [group_id, students[0].id], err => {
            if (err) {
                console.error('Group student removal error:', err);
                return res.status(500).send('Database error');
            }
            db.query('UPDATE students SET mentor_id = NULL WHERE id = ?', [students[0].id], err => {
                if (err) {
                    console.error('Mentor removal error:', err);
                    return res.status(500).send('Database error');
                }
                res.redirect('/group-management');
            });
        });
    });
});

app.get('/logout', (req, res) => {
    sessions = {};
    res.redirect('/');
});

// Export for Vercel serverless (no app.listen)
module.exports = app;
const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

// Simple hardcoded database configuration for mini project
const db = mysql.createConnection({
    host: 'mysql-prod-team-11-db.d.aivencloud.com',
    port: 18747,
    user: 'avnadmin',
    password: 'AVNS_LX08vO8haomAurd81HH',
    database: 'defaultdb',
    ssl: { ca: fs.readFileSync('ca.pem') },
    acquireTimeout: 60000,
    timeout: 60000
});

db.connect(err => { 
    if (err) throw err; 
    console.log('MySQL Connected to Aiven'); 
});

const upload = multer({ dest: 'uploads/' });

// Simple session (store user_id, role in memory)
let sessions = {};

// Routes
app.get('/', (req, res) => res.render('index'));

app.get('/student-login', (req, res) => res.render('student-login'));

app.post('/student/login', (req, res) => {
    const { email, password, name, reg_no, semester } = req.body;
    db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) {
            console.error('Login query error:', err);
            return res.send('Database error');
        }
        if (results.length === 0) return res.send('Invalid Credentials');
        const user = results[0];
        if (user.role !== 'student') return res.send('Not a student');
        sessions[email] = { user_id: user.id, role: user.role };
        db.query('INSERT INTO students (user_id, reg_no, semester) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE semester = ?', 
            [user.id, reg_no, semester, semester], err => {
                if (err) {
                    console.error('Student insert error:', err);
                    return res.send('Database error');
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
            return res.send('Database error');
        }
        if (students.length === 0) return res.send('Student data not found');
        const student = students[0];
        // Fetch evaluation data
        db.query('SELECT technical_skill, initiative, communication, professionalism, timely_completion, skills_gained, soft_skills, tools_used FROM evaluations WHERE student_id = ?', [user.user_id], (err, evaluations) => {
            if (err) {
                console.error('Evaluation query error:', err);
                return res.send('Database error');
            }
            const evaluation = evaluations[0] || null;
            // Prepare pie chart data (always valid JSON, even if no evaluation)
            const pieChartData = {
                technical_skill: evaluation ? evaluation.technical_skill || 0 : 0,
                initiative: evaluation ? evaluation.initiative || 0 : 0,
                communication: evaluation ? evaluation.communication || 0 : 0,
                professionalism: evaluation ? evaluation.professionalism || 0 : 0,
                timely_completion: evaluation ? evaluation.timely_completion || 0 : 0
            };
            res.render('student-dashboard', {
                student,
                evaluation,
                pieChartData: JSON.stringify(pieChartData)
            });
        });
    });
});

app.get('/faculty-login', (req, res) => res.render('faculty-login'));

app.post('/faculty/login', (req, res) => {
    const { email, password, department } = req.body;
    db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) {
            console.error('Faculty login query error:', err);
            return res.send('Database error');
        }
        if (results.length === 0) return res.send('Invalid Credentials');
        const user = results[0];
        if (user.role !== 'faculty') return res.send('Not a faculty');
        sessions[email] = { user_id: user.id, role: user.role };
        db.query('INSERT INTO faculty (user_id, department) VALUES (?, ?) ON DUPLICATE KEY UPDATE department = ?', 
            [user.id, department, department], err => {
                if (err) {
                    console.error('Faculty insert error:', err);
                    return res.send('Database error');
                }
                res.redirect('/faculty-dashboard');
            });
    });
});

app.get('/faculty-dashboard', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    db.query('SELECT u.name, s.reg_no, s.semester FROM users u JOIN students s ON u.id = s.user_id WHERE s.mentor_id = ?', [user.user_id], (err, students) => {
        if (err) {
            console.error('Faculty dashboard query error:', err);
            return res.send('Database error');
        }
        res.render('faculty-dashboard', { students });
    });
});

app.get('/evaluate/:reg_no', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const { reg_no } = req.params;
    db.query('SELECT id FROM students WHERE reg_no = ?', [reg_no], (err, students) => {
        if (err) {
            console.error('Student lookup error:', err);
            return res.send('Database error');
        }
        if (!students[0]) return res.send('Student not found');
        res.render('evaluation-form', { student_id: students[0].id, reg_no });
    });
});

app.post('/evaluate/:reg_no', upload.none(), (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const { reg_no } = req.params;
    const { technical_skill, initiative, communication, professionalism, timely_completion, skills_gained, soft_skills, tools_used, task_types } = req.body;
    db.query('SELECT id FROM students WHERE reg_no = ?', [reg_no], (err, students) => {
        if (err) {
            console.error('Student lookup error:', err);
            return res.send('Database error');
        }
        if (!students[0]) return res.send('Student not found');
        const student_id = students[0].id;
        db.query(
            'INSERT INTO evaluations (student_id, technical_skill, initiative, communication, professionalism, timely_completion, skills_gained, soft_skills, tools_used, task_types) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [student_id, technical_skill, initiative, communication, professionalism, timely_completion, skills_gained, soft_skills, tools_used, JSON.stringify(task_types || [])],
            err => {
                if (err) {
                    console.error('Evaluation insert error:', err);
                    return res.send('Database error');
                }
                res.redirect('/faculty-dashboard');
            }
        );
    });
});

app.post('/student/internship-submission', upload.fields([
    { name: 'offer_letter', maxCount: 1 },
    { name: 'completion_letter', maxCount: 1 },
    { name: 'lor', maxCount: 1 }
]), (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'student');
    if (!user) return res.redirect('/student-login');
    const { company_name, role, company_link, stipend, contact_email, start_date, end_date, company_mentor } = req.body;
    const files = req.files;
    const offer_letter = files['offer_letter'] ? files['offer_letter'][0].filename : null;
    const completion_letter = files['completion_letter'] ? files['completion_letter'][0].filename : null;
    const lor = files['lor'] ? files['lor'][0].filename : null;
    db.query(
        'INSERT INTO internships (student_id, company_name, role, company_link, stipend, contact_email, start_date, end_date, company_mentor, offer_letter, completion_letter, lor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user.user_id, company_name, role, company_link, stipend, contact_email, start_date, end_date, company_mentor, offer_letter, completion_letter, lor],
        err => {
            if (err) {
                console.error('Internship submission error:', err);
                return res.send('Database error');
            }
            res.redirect('/student-dashboard');
        }
    );
});

app.get('/view-attachments/:reg_no', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const { reg_no } = req.params;
    db.query('SELECT id FROM students WHERE reg_no = ?', [reg_no], (err, students) => {
        if (err) {
            console.error('Student lookup error:', err);
            return res.send('Database error');
        }
        if (!students[0]) return res.send('Student not found');
        db.query('SELECT offer_letter, completion_letter, lor FROM internships WHERE student_id = ?', [students[0].id], (err, internships) => {
            if (err) {
                console.error('Internship query error:', err);
                return res.send('Database error');
            }
            const internship = internships[0] || {};
            res.render('view-attachments', {
                offer_letter: internship.offer_letter,
                completion_letter: internship.completion_letter,
                lor: internship.lor
            });
        });
    });
});

app.get('/group-management', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    db.query('SELECT id, name FROM groups_table WHERE faculty_id = ?', [user.user_id], (err, groups) => {
        if (err) {
            console.error('Group query error:', err);
            return res.send('Database error');
        }
        res.render('group-management', { groups });
    });
});

app.post('/faculty/create-group', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const { group_name } = req.body;
    db.query('INSERT INTO groups_table (name, faculty_id) VALUES (?, ?)', [group_name, user.user_id], err => {
        if (err) {
            console.error('Group creation error:', err);
            return res.send('Database error');
        }
        res.redirect('/group-management');
    });
});

app.post('/faculty/add-student-to-group', (req, res) => {
    const user = Object.values(sessions).find(s => s.role === 'faculty');
    if (!user) return res.redirect('/faculty-login');
    const { group_id, reg_no } = req.body;
    db.query('SELECT id FROM students WHERE reg_no = ?', [reg_no], (err, students) => {
        if (err) {
            console.error('Student lookup error:', err);
            return res.send('Database error');
        }
        if (!students[0]) return res.send('Student not found');
        db.query('INSERT INTO group_students (group_id, student_id) VALUES (?, ?)', [group_id, students[0].id], err => {
            if (err) {
                console.error('Group student addition error:', err);
                return res.send('Database error');
            }
            db.query('UPDATE students SET mentor_id = (SELECT faculty_id FROM groups_table WHERE id = ?) WHERE id = ?', [group_id, students[0].id], err => {
                if (err) {
                    console.error('Mentor assignment error:', err);
                    return res.send('Database error');
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
            return res.send('Database error');
        }
        if (!students[0]) return res.send('Student not found');
        db.query('DELETE FROM group_students WHERE group_id = ? AND student_id = ?', [group_id, students[0].id], err => {
            if (err) {
                console.error('Group student removal error:', err);
                return res.send('Database error');
            }
            db.query('UPDATE students SET mentor_id = NULL WHERE id = ?', [students[0].id], err => {
                if (err) {
                    console.error('Mentor removal error:', err);
                    return res.send('Database error');
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
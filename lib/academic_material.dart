import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class AcademicMaterialScreen extends StatelessWidget {
  const AcademicMaterialScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Academic Material')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _YearCard('1st Year', () {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => FirstYearScreen()),
            );
          }),
          _YearCard('2nd Year', () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => DepartmentYearScreen(year: '2nd'),
              ),
            );
          }),
          _YearCard('3rd Year', () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => DepartmentYearScreen(year: '3rd'),
              ),
            );
          }),
          _YearCard('4th Year', () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => DepartmentYearScreen(year: '4th'),
              ),
            );
          }),
          _YearCard('5th Year', () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => DepartmentYearScreen(year: '5th'),
              ),
            );
          }),
          _YearCard('Additional', () {}),
        ],
      ),
    );
  }
}

/* ================= YEAR CARD ================= */

class _YearCard extends StatelessWidget {
  final String title;
  final VoidCallback onTap;

  const _YearCard(this.title, this.onTap);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 18),
        padding: const EdgeInsets.symmetric(
          horizontal: 20,
          vertical: 22,
        ),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: Theme.of(context)
                    .colorScheme
                    .primary
                    .withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                Icons.school_rounded,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(width: 16),
            Text(
              title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const Spacer(),
            const Icon(
              Icons.arrow_forward_ios,
              size: 16,
              color: Colors.black54,
            ),
          ],
        ),
      ),
    );
  }
}


/* ================= 1ST YEAR ================= */

class FirstYearScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final subjects = {
      'Mathematics': 'https://drive.google.com/',
      'Physics': 'https://drive.google.com/',
      'Chemistry': 'https://drive.google.com/',
      'Programming': 'https://drive.google.com/',
    };

    return Scaffold(
      appBar: AppBar(title: const Text('1st Year Subjects')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: subjects.entries
            .map((e) => SubjectTile(name: e.key, link: e.value))
            .toList(),
      ),
    );
  }
}

/* ================= DEPARTMENT FLOW ================= */

class DepartmentYearScreen extends StatelessWidget {
  final String year;

  DepartmentYearScreen({required this.year});

  @override
  Widget build(BuildContext context) {
    final departments = ['CSE', 'EE', 'ME', 'CE', 'IE'];

    return Scaffold(
      appBar: AppBar(title: Text('$year Year Departments')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: departments.map((dept) {
          return Card(
            child: ListTile(
              title: Text(dept),
              trailing: const Icon(Icons.arrow_forward_ios),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) =>
                        SubjectScreen(year: year, department: dept),
                  ),
                );
              },
            ),
          );
        }).toList(),
      ),
    );
  }
}

/* ================= SUBJECTS ================= */

class SubjectScreen extends StatelessWidget {
  final String year;
  final String department;

  SubjectScreen({required this.year, required this.department});

  @override
  Widget build(BuildContext context) {
    final subjects = {
      'Data Structures': 'https://drive.google.com/',
      'OS': 'https://drive.google.com/',
      'DBMS': 'https://drive.google.com/',
      'Algorithms': 'https://drive.google.com/',
    };

    return Scaffold(
      appBar: AppBar(title: Text('$department • $year Year')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: subjects.entries
            .map((e) => SubjectTile(name: e.key, link: e.value))
            .toList(),
      ),
    );
  }
}

/* ================= SUBJECT TILE ================= */

class SubjectTile extends StatelessWidget {
  final String name;
  final String link;

  const SubjectTile({
    required this.name,
    required this.link,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () async {
        final uri = Uri.parse(link);
        await launchUrl(
          uri,
          mode: LaunchMode.externalApplication,
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Theme.of(context)
                    .colorScheme
                    .primary
                    .withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                Icons.book_rounded,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                name,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const Icon(
              Icons.open_in_new,
              size: 18,
              color: Colors.black54,
            ),
          ],
        ),
      ),
    );
  }
}

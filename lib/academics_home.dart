import 'package:flutter/material.dart';
import 'academic_material.dart';

class AcademicsHomeScreen extends StatelessWidget {
  const AcademicsHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final academicsItems = [
      {
        'icon': Icons.menu_book_rounded,
        'title': 'Academic Material',
        'subtitle': 'Notes • PDFs • Slides',
        'onTap': () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => const AcademicMaterialScreen(),
            ),
          );
        },
      },
      {
        'icon': Icons.quiz_rounded,
        'title': 'PYQs',
        'subtitle': 'Previous year questions',
        'onTap': () {},
      },
      {
        'icon': Icons.help_outline_rounded,
        'title': 'FAQs',
        'subtitle': 'Rules & guidelines',
        'onTap': () {},
      },
      {
        'icon': Icons.description_rounded,
        'title': 'CVs & Internships',
        'subtitle': 'Templates & prep',
        'onTap': () {},
      },
      {
        'icon': Icons.apartment_rounded,
        'title': 'Departments',
        'subtitle': 'Dept info & contacts',
        'onTap': () {},
      },
      {
        'icon': Icons.groups_rounded,
        'title': 'Societies',
        'subtitle': 'Clubs & teams',
        'onTap': () {},
      },
      {
        'icon': Icons.restaurant_rounded,
        'title': 'HMC / Mess',
        'subtitle': 'Food & mess info',
        'onTap': () {},
      },
      {
        'icon': Icons.smart_toy_rounded,
        'title': 'Bot Helper',
        'subtitle': 'Ask anything',
        'onTap': () {},
      },
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Academics'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: GridView.builder(
          itemCount: academicsItems.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 16,
            crossAxisSpacing: 16,
            childAspectRatio: 0.95,
          ),
          itemBuilder: (context, index) {
            final item = academicsItems[index];
            return _AcademicsTile(
              icon: item['icon'] as IconData,
              title: item['title'] as String,
              
              onTap: item['onTap'] as VoidCallback,
            );
          },
        ),
      ),
    );
  }
}

/* ================= ACADEMICS TILE ================= */

class _AcademicsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  const _AcademicsTile({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 16,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Theme.of(context)
                    .colorScheme
                    .primary
                    .withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                icon,
                size: 30,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

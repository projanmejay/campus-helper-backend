import 'package:flutter/material.dart';
import 'food_screen.dart';
import 'academics_home.dart';
import 'navigation_screen.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  final List<Widget> _pages = const [
  AcademicsHomeScreen(),   // 🎓 FIRST
  FoodScreen(),            // 🍔 SECOND
  NavigationScreen(), // 🗺
  ShareTaxiPlaceholder(),  // 🚕
  DiscussionPlaceholder(), // 💬
];


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) {
          setState(() => _currentIndex = i);
        },
        destinations: const [
  NavigationDestination(
    icon: Icon(Icons.school_outlined),
    selectedIcon: Icon(Icons.school_rounded),
    label: 'Academics',
  ),
  NavigationDestination(
    icon: Icon(Icons.fastfood_outlined),
    selectedIcon: Icon(Icons.fastfood_rounded),
    label: 'Food',
  ),
  NavigationDestination(
    icon: Icon(Icons.map_outlined),
    selectedIcon: Icon(Icons.map_rounded),
    label: 'Navigation',
  ),
  NavigationDestination(
    icon: Icon(Icons.directions_car_outlined),
    selectedIcon: Icon(Icons.directions_car_rounded),
    label: 'Taxi',
  ),
  NavigationDestination(
    icon: Icon(Icons.forum_outlined),
    selectedIcon: Icon(Icons.forum_rounded),
    label: 'Discuss',
  ),
],

      ),
    );
  }
}

/* ================= PLACEHOLDERS ================= */

class NavigationPlaceholder extends StatelessWidget {
  const NavigationPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
  appBar: AppBar(title: const Text('Campus Navigation')),
  body: const Center(child: Text('Navigation coming soon')),
);

  }
}

class AcademicHubPlaceholder extends StatelessWidget {
  const AcademicHubPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
  appBar: AppBar(title: const Text('Campus Navigation')),
  body: const Center(child: Text('Navigation coming soon')),
);

  }
}

class ShareTaxiPlaceholder extends StatelessWidget {
  const ShareTaxiPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
  appBar: AppBar(title: const Text('Campus Navigation')),
  body: const Center(child: Text('Navigation coming soon')),
);

  }
}

class DiscussionPlaceholder extends StatelessWidget {
  const DiscussionPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
  appBar: AppBar(title: const Text('Campus Navigation')),
  body: const Center(child: Text('Navigation coming soon')),
);

  }
}

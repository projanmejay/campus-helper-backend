import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'food_screen.dart';
import 'cart_provider.dart';
import 'main_shell.dart';


void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => CartProvider(),
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'MOTU Helper',
        theme: ThemeData(
  useMaterial3: true,

  // 🎨 Main color
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFF1E40FF),
  ),

  // 🌤 Soft background everywhere
  scaffoldBackgroundColor: const Color(0xFFF6F7FB),

  // 🧭 AppBar clean look
  appBarTheme: const AppBarTheme(
    centerTitle: true,
    elevation: 0,
    backgroundColor: Colors.transparent,
    foregroundColor: Colors.black,
  ),

  // 🧩 Buttons (rounded & comfy)
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.symmetric(vertical: 14),
    ),
  ),
),


        home: const MainShell(),
      ),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('MOTU Helper'),
        centerTitle: true,
        actions: [
          // cart icon with badge
          IconButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const FoodScreen()),
              );
            },
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                const Icon(Icons.restaurant_menu),
                if (cart.totalItems > 0)
                  Positioned(
                    right: -6,
                    top: -6,
                    child: CircleAvatar(
                      radius: 9,
                      backgroundColor: const Color.fromARGB(255, 0, 38, 255),
                      child: Text(
                        cart.totalItems.toString(),
                        style: const TextStyle(fontSize: 11, color: Colors.white),
                      ),
                    ),
                  ),
              ],
            ),
            tooltip: 'Campus Food',
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _HomeButton(
              icon: Icons.restaurant,
              text: 'Campus Food',
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const FoodScreen()),
                );
              },
            ),
            const SizedBox(height: 20),
            _HomeButton(
              icon: Icons.directions_car,
              text: 'Cab Share',
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Cab Share coming soon')),
                );
              },
            ),
            const SizedBox(height: 20),
            _HomeButton(
              icon: Icons.map,
              text: 'Nalanda Navigation',
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Navigation coming soon')),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _HomeButton extends StatelessWidget {
  final IconData icon;
  final String text;
  final VoidCallback onTap;

  const _HomeButton({
    required this.icon,
    required this.text,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 60,
      child: ElevatedButton.icon(
        icon: Icon(icon, size: 28),
        label: Text(
          text,
          style: const TextStyle(fontSize: 18),
        ),
        onPressed: onTap,
      ),
    );
  }
}

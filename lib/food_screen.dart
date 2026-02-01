import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'cart_provider.dart';
import 'cart_screen.dart';

class FoodScreen extends StatelessWidget {
  const FoodScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Campus Food'),
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _canteenCard(context, 'RK Hall'),
          const SizedBox(height: 16),
          _canteenCard(context, 'Azad Hall'),
        ],
      ),
    );
  }

  Widget _canteenCard(BuildContext context, String name) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: const Icon(Icons.restaurant, size: 32),
        title: Text(
          name,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        subtitle: const Text('Tap to view menu'),
        trailing: const Icon(Icons.arrow_forward_ios),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => MenuScreen(canteenName: name),
            ),
          );
        },
      ),
    );
  }
}

// ===============================================================
// ========================= MENU SCREEN =========================
// ===============================================================

class MenuScreen extends StatefulWidget {
  final String canteenName;

  const MenuScreen({super.key, required this.canteenName});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  // Demo menu (can be fetched from backend later)
  final List<Map<String, dynamic>> menu = [
    {'id': 'roti', 'name': 'Roti', 'price': 1},
    {'id': 'paneer_butter_masala', 'name': 'Paneer Butter Masala', 'price': 80},
    {'id': 'veg_pulav', 'name': 'Veg Pulav', 'price': 60},
    {'id': 'tea', 'name': 'Tea', 'price': 10},
  ];

  @override
  void initState() {
    super.initState();

    // 🔥 VERY IMPORTANT: set active canteen
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CartProvider>().setActiveCanteen(widget.canteenName);
    });
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.canteenName),
        actions: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              IconButton(
                icon: const Icon(Icons.shopping_cart),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => CartScreen(canteenName: widget.canteenName),
                    ),
                  );
                },
              ),
              if (cart.totalItems > 0)
                Positioned(
                  right: 6,
                  top: 6,
                  child: CircleAvatar(
                    radius: 9,
                    backgroundColor: Colors.red,
                    child: Text(
                      cart.totalItems.toString(),
                      style: const TextStyle(fontSize: 11, color: Colors.white),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Expanded(
              child: ListView.separated(
                itemCount: menu.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final item = menu[index];

                  // quantity from active canteen cart
                  final qty = cart.items
                      .firstWhere(
                        (e) => e.id == item['id'],
                        orElse: () => CartItem(
                          id: item['id'],
                          name: item['name'],
                          price: item['price'],
                          qty: 0,
                        ),
                      )
                      .qty;

                  return Card(
                    elevation: 2,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${item['name']}  ₹${item['price']}',
                              style: const TextStyle(fontSize: 16),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.remove),
                            onPressed: qty > 0
                                ? () => cart.removeSingle(item['id'])
                                : null,
                          ),
                          Text(
                            qty.toString(),
                            style: const TextStyle(fontSize: 16),
                          ),
                          IconButton(
                            icon: const Icon(Icons.add),
                            onPressed: () {
                              cart.addItem(
                                item['id'],
                                item['name'],
                                item['price'],
                              );
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content:
                                      Text('${item['name']} added to cart'),
                                  duration:
                                      const Duration(milliseconds: 600),
                                ),
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: cart.totalItems == 0
                    ? null
                    : () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                CartScreen(canteenName: widget.canteenName),
                          ),
                        );
                      },
                child: Text(
                  cart.totalItems == 0
                      ? 'Cart is empty'
                      : 'View Cart • ₹${cart.totalAmount}',
                  style: const TextStyle(fontSize: 18),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

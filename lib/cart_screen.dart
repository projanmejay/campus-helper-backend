import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'cart_provider.dart';
import 'payment_option_screen.dart';

class CartScreen extends StatelessWidget {
  final String? canteenName; // optional; passed from menu

  const CartScreen({super.key, this.canteenName});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your Cart'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: cart.totalItems == 0
            ? const Center(child: Text('Your cart is empty'))
            : Column(
                children: [
                  Expanded(
                    child: ListView.separated(
                      itemCount: cart.items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        final it = cart.items[i];
                        return ListTile(
                          title: Text(it.name),
                          subtitle: Text('₹${it.price} x ${it.qty} = ₹${it.price * it.qty}'),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                onPressed: () => context.read<CartProvider>().removeSingle(it.id),
                                icon: const Icon(Icons.remove_circle_outline),
                              ),
                              IconButton(
                                onPressed: () => context.read<CartProvider>().addItem(it.id, it.name, it.price),
                                icon: const Icon(Icons.add_circle_outline),
                              ),
                              IconButton(
                                onPressed: () => context.read<CartProvider>().removeItem(it.id),
                                icon: const Icon(Icons.delete_outline),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Text('Total: ₹${cart.totalAmount}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: () {
                        // Prepare to navigate to payment screen
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => PaymentOptionScreen(
                              canteen: canteenName ?? 'Campus Canteen',
                              rotiQty: cart.toOrderItemsMap()['roti'] ?? 0,
                              paneerQty: cart.toOrderItemsMap()['paneer_butter_masala'] ?? 0,
                              totalAmount: cart.totalAmount,
                            ),
                          ),
                        );
                      },
                      child: const Text('Proceed to Pay', style: TextStyle(fontSize: 18)),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
